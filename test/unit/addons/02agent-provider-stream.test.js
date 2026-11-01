/**
 * Unit tests for the provider-adapter polish round: OpenAI-compatible streaming
 * tool-call name reassembly (duplicate full-name resends vs true incremental
 * deltas) and empty-response defences.
 */
import {describe, expect, test} from '@jest/globals';

// Minimal in-memory stream for the adapters to read.
const sseStream = (chunks) => {
    const encoder = new TextEncoder();
    return {
        ok: true,
        status: 200,
        statusText: 'OK',
        body: {
            getReader: () => {
                let i = 0;
                return {
                    read: async () =>
                        i < chunks.length
                            ? {done: false, value: encoder.encode(chunks[i++])}
                            : {done: true, value: undefined}
                };
            }
        },
        text: async () => ''
    };
};

const deltaData = (delta, extra = {}) =>
    `data: ${JSON.stringify({choices: [{delta, ...extra}]})}\n\n`;

const runStream = async (chunks, agentOverrides = {}) => {
    const {getProviderAdapter} = await import(
        '../../../src/addons/addons/02agent/providerAdapters'
    );
    const globalFetch = global.fetch;
    global.fetch = async () => sseStream(chunks);
    try {
        const adapter = getProviderAdapter('custom');
        return await adapter.sendChatCompletion({
            agent: {
                baseUrl: 'https://example.invalid/v1',
                apiKey: 'k',
                modelName: 'm',
                provider: 'custom',
                ...agentOverrides
            },
            messages: [],
            tools: [],
            toolChoice: 'auto',
            enableReasoning: false
        });
    } finally {
        global.fetch = globalFetch;
    }
};

const DER = `
    data: {"choices":[{"finish_reason":"tool_calls"}]}

    data: [DONE]

`;

describe('02Agent OpenAI streaming tool-call name reassembly', () => {
    test('duplicate full-name resends from compatible gateways do not concatenate', async () => {
        const argsPart = JSON.stringify({path: 'a'});
        const data = await runStream([
            deltaData({tool_calls: [{index: 0, id: 'c1', function: {name: 'readFile', arguments: ''}}]}),
            deltaData({tool_calls: [{index: 0, function: {name: 'readFile', arguments: '{'}}]}),
            deltaData({tool_calls: [{index: 0, function: {name: 'readFile', arguments: argsPart.slice(1)}}]}),
            DER
        ]);
        const call = data.choices[0].message.tool_calls[0];
        expect(call.function.name).toBe('readFile');
        expect(call.function.arguments).toBe(argsPart);
    });

    test('true incremental name deltas still reassemble in order', async () => {
        const data = await runStream([
            deltaData({tool_calls: [{index: 0, id: 'c1', function: {name: 'read'}}]}),
            deltaData({tool_calls: [{index: 0, function: {name: 'File', arguments: '{}'}}]}),
            // A late resend of the full accumulated name must not corrupt it.
            deltaData({tool_calls: [{index: 0, function: {name: 'readFile'}}]}),
            DER
        ]);
        expect(data.choices[0].message.tool_calls[0].function.name).toBe('readFile');
    });

    test('multiple tool calls stay indexed apart', async () => {
        const args = JSON.stringify({query: 'x'});
        const data = await runStream([
            deltaData({tool_calls: [{index: 0, id: 'a', function: {name: 'readFile', arguments: '{}'}}]}),
            deltaData({tool_calls: [{index: 1, id: 'b', function: {name: 'searchBlocks', arguments: args.slice(0, 1)}}]}),
            deltaData({tool_calls: [{index: 1, function: {name: 'searchBlocks', arguments: args.slice(1)}}]}),
            DER
        ]);
        const calls = data.choices[0].message.tool_calls;
        expect(calls.map((c) => c.function.name)).toEqual(['readFile', 'searchBlocks']);
        expect(calls[1].function.arguments).toBe(args);
    });
});
