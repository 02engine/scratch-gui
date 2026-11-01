/**
 * Unit tests for the extracted subagent tool-loop (hooks/useSubagentLoop).
 * Covers: plain completion, tool rounds then final text, partial fallback on
 * adapter failure, fail-through without any text, and the round cap.
 */
import {describe, expect, test, beforeAll} from '@jest/globals';

let runSubagentLoop;
beforeAll(async () => {
    ({runSubagentLoop} = await import('../../../src/addons/addons/02agent/hooks/useSubagentLoop'));
});

const done = (text, toolCalls) => ({choices: [{message: {content: text, tool_calls: toolCalls}}]});

const makeDeps = (script) => {
    let step = 0;
    const calls = [];
    return {
        calls,
        deps: {
            sendMessage: async (messages, opts) => {
                calls.push({kind: 'send', messages: JSON.parse(JSON.stringify(messages))});
                const item = script[step++];
                if (!item) throw new Error('script exhausted');
                if (item.stream) {
                    for (const chunk of item.stream) opts.onTextDelta(chunk);
                    return item.return || done('', item.toolCalls);
                }
                if (item.throw) throw item.throw;
                return item.return;
            },
            executeTool: async (name, args) => {
                calls.push({kind: 'tool', name, args});
                return {echo: args};
            },
        },
    };
};

describe('runSubagentLoop', () => {
    test('plain completion without tool calls returns the streamed text', async () => {
        const {deps} = makeDeps([
            {stream: ['严重问题：', 'loss 双计'], return: done('', [])},
        ]);
        const result = await runSubagentLoop(deps, {profile: 'critic', task: '检查', systemPrompt: 'SP'});
        expect(result).toEqual({profile: 'critic', task: '检查', summary: '严重问题：loss 双计'});
    });

    test('falls back to the final message content when the adapter does not stream', async () => {
        const {deps} = makeDeps([{return: done('非流式结论', [])}]);
        const result = await runSubagentLoop(deps, {profile: 'critic', task: 't', systemPrompt: 'SP'});
        expect(result.summary).toBe('非流式结论');
    });

    test('runs bounded tool rounds, whitelisting is delegated to executeTool host', async () => {
        const {deps, calls} = makeDeps([
            {return: done('', [{id: 'c1', function: {name: 'readFile', arguments: '{"path":"/x.js"}'}}])},
            {stream: ['最终结论'], return: done('', [])},
        ]);
        const result = await runSubagentLoop(deps, {profile: 'critic', task: 't', systemPrompt: 'SP'});
        expect(calls.filter((c) => c.kind === 'tool')).toEqual([
            {kind: 'tool', name: 'readFile', args: {path: '/x.js'}},
        ]);
        // tool result is appended as a role:tool message and trimmed to 2000 chars
        const sendCalls = calls.filter((c) => c.kind === 'send');
        const toolMsg = sendCalls[sendCalls.length - 1].messages.find((m) => m.role === 'tool');
        expect(toolMsg.tool_call_id).toBe('c1');
        expect(JSON.parse(toolMsg.content)).toEqual({echo: {path: '/x.js'}});
        expect(result.summary).toBe('最终结论');
    });

    test('broken tool-call JSON defaults to empty args, not a crash', async () => {
        const {deps, calls} = makeDeps([
            {return: done('', [{id: 'c2', function: {name: 'listFiles', arguments: 'NOT-JSON'}}])},
            {stream: ['ok'], return: done('', [])},
        ]);
        await runSubagentLoop(deps, {profile: 'critic', task: 't', systemPrompt: 'SP'});
        expect(calls.find((c) => c.kind === 'tool').args).toEqual({});
    });

    test('adapter failure keeps the current-round text as a partial result', async () => {
        const {deps} = makeDeps([
            {stream: ['第一轮草稿']} , // sendMessage throws (script exhausted after first flow)
        ]);
        // note: {stream:[...]} without return/toolCalls resolves to done('', undefined) -> no tools -> stop
        // force a throw instead:
        const throwing = makeDeps([{stream: ['当轮文本 '], return: done('', [{function: {name: 'readFile', arguments: '{}'}}])}, {throw: new Error('boom')}]);
        const result = await runSubagentLoop(throwing.deps, {profile: 'critic', task: 't', systemPrompt: 'SP'});
        expect(result.partial).toBe(true);
        expect(result.summary).toBe('当轮文本');
    });

    test('falls back to an earlier round text when the final round has none', async () => {
        const scripted = makeDeps([
            {stream: ['第一轮内容'], return: done('', [{function: {name: 'readFile', arguments: '{}'}}])},
            {throw: new Error('network gone')},
        ]);
        const result = await runSubagentLoop(scripted.deps, {profile: 'critic', task: 't', systemPrompt: 'SP'});
        expect(result.partial).toBe(true);
        expect(result.summary).toBe('第一轮内容');
    });

    test('re-throws when nothing usable was produced', async () => {
        const scripted = makeDeps([{throw: new Error('no text at all')}]);
        await expect(runSubagentLoop(scripted.deps, {profile: 'critic', task: 't', systemPrompt: 'SP'}))
            .rejects.toThrow('no text at all');
    });

    test('respects the round cap (3) even when the model keeps calling tools', async () => {
        const toolCall = () => ({function: {name: 'readFile', arguments: '{}'}});
        const scripted = makeDeps([
            {return: done('', [toolCall()])},
            {return: done('', [toolCall()])},
            {return: done('', [toolCall()])},
        ]);
        const result = await runSubagentLoop(scripted.deps, {profile: 'critic', task: 't', systemPrompt: 'SP'});
        expect(scripted.calls.filter((c) => c.kind === 'send')).toHaveLength(3);
        // no usable text within cap -> empty summary marker
        expect(result.summary).toBe('（子智能体没有返回内容）');
    });

    test('assembles system + optional context in the first message', async () => {
        const {deps, calls} = makeDeps([{
            stream: ['ok'],
            return: done('', []),
        }]);
        await runSubagentLoop(deps, {profile: 'critic', task: '任务X', systemPrompt: 'SP', context: 'CTX-1'});
        const first = calls[0].messages[0];
        expect(first.role).toBe('system');
        expect(first.content).toContain('SP');
        expect(first.content).toContain('Relevant context:');
        expect(first.content).toContain('CTX-1');
        expect(calls[0].messages[1]).toEqual({role: 'user', content: '任务X'});
    });
});
