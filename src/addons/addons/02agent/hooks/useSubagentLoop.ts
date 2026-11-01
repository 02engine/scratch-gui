/**
 * Pure subagent tool-loop, extracted from the useChat hook so it can be unit-tested.
 * The hook supplies adapter.sendMessage / tool executor callbacks; this module owns
 * the loop semantics: bounded rounds, read-only tool whitelist handled by the host,
 * partial-result fallback, and fail-through with no usable text.
 */
import type {SubagentResult} from "../agentStores";

export interface SubagentLoopDeps {
    /** Send one chat completion; resolves provider data (choices[0].message). */
    sendMessage: (messages: any[], opts: {onTextDelta: (delta: string) => void}) => Promise<any>;
    /** Execute a named tool call (host enforces the read-only whitelist). */
    executeTool: (name: string, args: any) => Promise<unknown>;
    maxRounds?: number;
}

export const runSubagentLoop = async (
    deps: SubagentLoopDeps,
    {profile, task, systemPrompt, context}: {profile: string; task: string; systemPrompt: string; context?: string},
): Promise<SubagentResult> => {
    const chatMessages: any[] = [
        {role: "system", content: `${systemPrompt}${context ? `\n\nRelevant context:\n${context.slice(0, 6000)}` : ""}`},
        {role: "user", content: task},
    ];
    let lastText = "";
    let earlierRounds: string[] = [];
    const maxRounds = Math.max(1, deps.maxRounds || 3);
    try {
        for (let round = 1; round <= maxRounds; round += 1) {
            if (lastText.trim()) earlierRounds = [...earlierRounds, lastText].slice(-3);
            let roundText = "";
            const data = await deps.sendMessage(chatMessages, {
                onTextDelta: (delta: string) => {
                    roundText += delta;
                },
            });
            // Some adapters only stream; make sure the final message content is accounted for.
            lastText = roundText || String(data?.choices?.[0]?.message?.content || "");
            const response: any = data?.choices?.[0]?.message;
            const toolCalls = Array.isArray(response?.tool_calls) ? response.tool_calls : [];
            if (!toolCalls.length || round === maxRounds) break;

            chatMessages.push({role: "assistant", content: response?.content || "", tool_calls: toolCalls});
            for (const call of toolCalls) {
                let args: any = {};
                try {
                    args = call?.function?.arguments ? JSON.parse(call.function.arguments) : {};
                } catch {
                    args = {};
                }
                let resultText: string;
                try {
                    const result = await deps.executeTool(String(call?.function?.name || ""), args);
                    resultText = JSON.stringify(result ?? {ok: true});
                } catch (error) {
                    resultText = JSON.stringify({error: String((error as Error)?.message || error)});
                }
                chatMessages.push({
                    role: "tool",
                    tool_call_id: String(call?.id || `call-${round}`),
                    content: resultText.slice(0, 2000),
                });
            }
        }
        return {profile, task, summary: lastText.trim() || "（子智能体没有返回内容）"};
    } catch (error) {
        // Partial results: keep whatever the model already produced instead of losing it.
        // Prefer the current round; fall back to text from earlier rounds.
        const partial =
            lastText.trim() ||
            [...earlierRounds].reverse().map((item) => item.trim()).find(Boolean) ||
            "";
        if (!partial) throw error;
        return {profile, task, summary: partial, partial: true};
    }
};
