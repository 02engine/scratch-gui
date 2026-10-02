import * as React from "react";
import { ChatArea } from "./ChatArea";
import { ChatMessage } from "../types";
import {
    BENCHMARK_PRESETS,
    BenchmarkParams,
    FluencyMonitor,
    FluencyReport,
    runStreamingBenchmark,
} from "../debug/benchmark";

interface DebugPanelProps {
    vm: any;
    themeMode: "dark" | "light";
    onClose: () => void;
}

const clampNumber = (raw: string, fallback: number, min: number) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.floor(parsed));
};

const formatDuration = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

export const DebugPanel: React.FC<DebugPanelProps> = ({ vm, themeMode, onClose }) => {
    const isDark = themeMode === "dark";
    const palette = isDark
        ? {
            overlay: "rgba(0, 0, 0, 0.6)",
            card: "#1b1d22",
            surface: "#24262c",
            surfaceSoft: "#2c2f36",
            border: "#3a3f49",
            text: "#e8eaed",
            muted: "#9aa3b2",
            accent: "#4c8dff",
            accentSoft: "rgba(76, 141, 255, 0.16)",
            danger: "#ff6b6b",
        }
        : {
            overlay: "rgba(20, 24, 33, 0.38)",
            card: "#ffffff",
            surface: "#f4f6f9",
            surfaceSoft: "#eef1f5",
            border: "#d7dbe2",
            text: "#1c1f26",
            muted: "#5b6472",
            accent: "#2563eb",
            accentSoft: "rgba(37, 99, 235, 0.12)",
            danger: "#d64545",
        };

    const [params, setParams] = React.useState<BenchmarkParams>(BENCHMARK_PRESETS[0]);
    const [messages, setMessages] = React.useState<ChatMessage[]>([]);
    const [running, setRunning] = React.useState(false);
    const [report, setReport] = React.useState<FluencyReport | null>(null);
    const [live, setLive] = React.useState({ fps: 0, elapsedMs: 0 });

    const monitorRef = React.useRef<FluencyMonitor | null>(null);
    const abortRef = React.useRef<AbortController | null>(null);
    const liveTimerRef = React.useRef<number | null>(null);

    const clearLiveTimer = React.useCallback(() => {
        if (liveTimerRef.current !== null) {
            window.clearInterval(liveTimerRef.current);
            liveTimerRef.current = null;
        }
    }, []);

    React.useEffect(
        () => () => {
            abortRef.current?.abort();
            clearLiveTimer();
        },
        [clearLiveTimer],
    );

    const handleStart = React.useCallback(async () => {
        if (running) return;
        clearLiveTimer();
        setMessages([]);
        setReport(null);
        setLive({ fps: 0, elapsedMs: 0 });
        setRunning(true);

        const controller = new AbortController();
        abortRef.current = controller;
        const monitor = new FluencyMonitor();
        monitorRef.current = monitor;
        monitor.start();

        liveTimerRef.current = window.setInterval(() => {
            setLive({ fps: monitor.getLiveFps(), elapsedMs: monitor.getElapsedMs() });
        }, 250);

        let result: { chars: number; aborted: boolean } = { chars: 0, aborted: false };
        try {
            result = await runStreamingBenchmark(params, { onMessages: setMessages, signal: controller.signal });
        } finally {
            clearLiveTimer();
            const nextReport = monitor.stop(result.chars, result.aborted);
            setLive({ fps: nextReport.fps, elapsedMs: nextReport.durationMs });
            setReport(nextReport);
            setRunning(false);
            abortRef.current = null;
        }
    }, [params, running, clearLiveTimer]);

    const handleStop = React.useCallback(() => {
        abortRef.current?.abort();
    }, []);

    const applyPreset = (preset: BenchmarkParams) => {
        if (running) return;
        setParams({ ...preset });
    };

    const updateNumberField = (field: "textChars" | "chunkChars" | "intervalMs", raw: string, min: number) => {
        setParams((previous) => ({ ...previous, [field]: clampNumber(raw, previous[field], min) }));
    };

    const updateFlagField = (field: "withReasoning" | "withToolCallChurn", value: boolean) => {
        setParams((previous) => ({ ...previous, [field]: value }));
    };

    const streamedChars = React.useMemo(() => {
        const assistant = messages.find((message) => message.role === "assistant");
        return assistant?.content.length || 0;
    }, [messages]);

    const numberInputStyle: React.CSSProperties = {
        width: "100%",
        minHeight: 34,
        padding: "0 10px",
        border: `1px solid ${palette.border}`,
        borderRadius: 8,
        background: palette.surface,
        color: palette.text,
        outline: "none",
        font: "inherit",
        fontSize: 13,
    };

    const labelStyle: React.CSSProperties = {
        display: "block",
        marginBottom: 6,
        color: palette.muted,
        fontSize: 12,
        fontWeight: 700,
    };

    const checkboxRowStyle: React.CSSProperties = {
        display: "flex",
        alignItems: "center",
        gap: 8,
        color: palette.text,
        fontSize: 13,
        cursor: running ? "not-allowed" : "pointer",
    };

    const reportRows: Array<[string, string]> = report
        ? [
            ["总耗时", formatDuration(report.durationMs)],
            ["采样帧数", String(report.frames)],
            ["平均 FPS", report.fps.toFixed(1)],
            ["掉帧数（帧间隔 > 50ms）", String(report.droppedFrames)],
            ["掉帧率", `${(report.droppedRatio * 100).toFixed(1)}%`],
            ["最长帧", `${report.longestFrameMs.toFixed(1)} ms`],
            ["P95 帧间隔", `${report.p95FrameMs.toFixed(1)} ms`],
            ["长任务次数", String(report.longTasks)],
            ["长任务总耗时", `${report.longTaskTotalMs.toFixed(1)} ms`],
            ["最长长任务", `${report.worstLongTaskMs.toFixed(1)} ms`],
            ["输出字符数", report.chars.toLocaleString()],
            ["输出吞吐", `${report.charsPerSecond.toFixed(0)} 字符/秒`],
            ["是否中止", report.aborted ? "是（手动停止）" : "否（自然完成）"],
        ]
        : [];

    return (
        <div
            style={{
                position: "absolute",
                inset: 0,
                zIndex: 200,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 18,
                background: palette.overlay,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    width: "min(1040px, 100%)",
                    maxHeight: "100%",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    border: `1px solid ${palette.border}`,
                    borderRadius: 12,
                    background: palette.card,
                    color: palette.text,
                    boxShadow: "0 24px 80px rgba(0, 0, 0, 0.45)",
                }}
                onClick={(event) => event.stopPropagation()}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "12px 16px",
                        borderBottom: `1px solid ${palette.border}`,
                    }}
                >
                    <div>
                        <strong style={{ fontSize: 16 }}>性能基准</strong>
                        <div style={{ marginTop: 4, color: palette.muted, fontSize: 12 }}>
                            在真实聊天渲染管线中模拟流式输出，测量帧率与卡顿；不会写入真实会话历史。
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        title="关闭"
                        aria-label="关闭"
                        style={{
                            minWidth: 32,
                            minHeight: 32,
                            border: `1px solid ${palette.border}`,
                            borderRadius: 8,
                            background: palette.surface,
                            color: palette.text,
                            cursor: "pointer",
                            fontSize: 14,
                            lineHeight: 1,
                        }}
                    >
                        ×
                    </button>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: 16, overflow: "auto" }}>
                    <section
                        style={{
                            flex: "1 1 320px",
                            minWidth: 280,
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                            padding: 12,
                            border: `1px solid ${palette.border}`,
                            borderRadius: 10,
                            background: palette.surface,
                        }}
                    >
                        <div>
                            <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 750 }}>参数</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                {BENCHMARK_PRESETS.map((preset) => {
                                    const active = params.label === preset.label;
                                    return (
                                        <button
                                            key={preset.label}
                                            type="button"
                                            onClick={() => applyPreset(preset)}
                                            disabled={running}
                                            style={{
                                                minHeight: 32,
                                                padding: "0 12px",
                                                border: `1px solid ${active ? palette.accent : palette.border}`,
                                                borderRadius: 8,
                                                background: active ? palette.accentSoft : palette.card,
                                                color: palette.text,
                                                cursor: running ? "not-allowed" : "pointer",
                                                font: "inherit",
                                                fontSize: 13,
                                                fontWeight: 650,
                                                opacity: running ? 0.6 : 1,
                                            }}
                                        >
                                            {preset.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                            <label>
                                <span style={labelStyle}>文本字符数</span>
                                <input
                                    type="number"
                                    min={1}
                                    step={1000}
                                    value={params.textChars}
                                    disabled={running}
                                    onChange={(event) => updateNumberField("textChars", event.target.value, 1)}
                                    style={numberInputStyle}
                                />
                            </label>
                            <label>
                                <span style={labelStyle}>每档字符数</span>
                                <input
                                    type="number"
                                    min={1}
                                    step={50}
                                    value={params.chunkChars}
                                    disabled={running}
                                    onChange={(event) => updateNumberField("chunkChars", event.target.value, 1)}
                                    style={numberInputStyle}
                                />
                            </label>
                            <label>
                                <span style={labelStyle}>间隔（毫秒）</span>
                                <input
                                    type="number"
                                    min={0}
                                    step={5}
                                    value={params.intervalMs}
                                    disabled={running}
                                    onChange={(event) => updateNumberField("intervalMs", event.target.value, 0)}
                                    style={numberInputStyle}
                                />
                            </label>
                        </div>

                        <label style={checkboxRowStyle}>
                            <input
                                type="checkbox"
                                checked={params.withReasoning}
                                disabled={running}
                                onChange={(event) => updateFlagField("withReasoning", event.target.checked)}
                            />
                            <span>同时流式输出思考过程（reasoning）</span>
                        </label>
                        <label style={checkboxRowStyle}>
                            <input
                                type="checkbox"
                                checked={params.withToolCallChurn}
                                disabled={running}
                                onChange={(event) => updateFlagField("withToolCallChurn", event.target.checked)}
                            />
                            <span>周期性产生流式工具调用（增加渲染压力）</span>
                        </label>

                        <div style={{ display: "flex", gap: 8 }}>
                            <button
                                type="button"
                                onClick={() => void handleStart()}
                                disabled={running}
                                style={{
                                    minHeight: 36,
                                    padding: "0 14px",
                                    border: `1px solid ${palette.accent}`,
                                    borderRadius: 8,
                                    background: palette.accent,
                                    color: "#ffffff",
                                    cursor: running ? "not-allowed" : "pointer",
                                    font: "inherit",
                                    fontSize: 13,
                                    fontWeight: 700,
                                    opacity: running ? 0.6 : 1,
                                }}
                            >
                                开始基准
                            </button>
                            <button
                                type="button"
                                onClick={handleStop}
                                disabled={!running}
                                style={{
                                    minHeight: 36,
                                    padding: "0 14px",
                                    border: `1px solid ${palette.border}`,
                                    borderRadius: 8,
                                    background: palette.card,
                                    color: running ? palette.danger : palette.muted,
                                    cursor: running ? "pointer" : "not-allowed",
                                    font: "inherit",
                                    fontSize: 13,
                                    fontWeight: 650,
                                    opacity: running ? 1 : 0.55,
                                }}
                            >
                                停止
                            </button>
                        </div>

                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                                gap: 8,
                                padding: 10,
                                border: `1px solid ${palette.border}`,
                                borderRadius: 8,
                                background: palette.card,
                            }}
                        >
                            <div>
                                <div style={labelStyle}>当前 FPS</div>
                                <div style={{ fontSize: 18, fontWeight: 750 }}>{live.fps.toFixed(1)}</div>
                            </div>
                            <div>
                                <div style={labelStyle}>已用时间</div>
                                <div style={{ fontSize: 18, fontWeight: 750 }}>{formatDuration(live.elapsedMs)}</div>
                            </div>
                            <div>
                                <div style={labelStyle}>已输出字符</div>
                                <div style={{ fontSize: 18, fontWeight: 750 }}>{streamedChars.toLocaleString()}</div>
                            </div>
                        </div>

                        {report ? (
                            <div
                                style={{
                                    padding: 10,
                                    border: `1px solid ${palette.border}`,
                                    borderRadius: 8,
                                    background: palette.card,
                                }}
                            >
                                <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 750 }}>基准报告</div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                    {reportRows.map(([label, value]) => (
                                        <div
                                            key={label}
                                            style={{
                                                display: "flex",
                                                alignItems: "baseline",
                                                justifyContent: "space-between",
                                                gap: 12,
                                                fontSize: 12,
                                            }}
                                        >
                                            <span style={{ color: palette.muted }}>{label}</span>
                                            <span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
                                        </div>
                                    ))}
                                </div>
                                <div
                                    style={{
                                        marginTop: 10,
                                        paddingTop: 8,
                                        borderTop: `1px solid ${palette.border}`,
                                        color: palette.muted,
                                        fontSize: 12,
                                        lineHeight: 1.6,
                                    }}
                                >
                                    平均 FPS {report.fps.toFixed(1)} · 掉帧率{" "}
                                    {(report.droppedRatio * 100).toFixed(1)}% · 最长帧 {report.longestFrameMs.toFixed(1)} ms ·
                                    长任务 {report.longTasks} 次
                                    <br />
                                    掉帧率越低、最长帧越小、长任务越少，说明流式输出越流畅。
                                </div>
                            </div>
                        ) : (
                            <div style={{ color: palette.muted, fontSize: 12, lineHeight: 1.6 }}>
                                点击「开始基准」后，这里会显示运行状态与结束后的流畅度报告。
                            </div>
                        )}
                    </section>

                    <section
                        style={{
                            flex: "1 1 420px",
                            minWidth: 320,
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                        }}
                    >
                        <div style={{ fontSize: 13, fontWeight: 750 }}>实时预览（真实 ChatArea）</div>
                        <div
                            style={{
                                height: 420,
                                display: "flex",
                                flexDirection: "column",
                                overflow: "hidden",
                                border: `1px solid ${palette.border}`,
                                borderRadius: 10,
                                background: palette.surfaceSoft,
                            }}
                        >
                            <ChatArea
                                messages={messages}
                                isGenerating={running}
                                vm={vm}
                                onOpenWorkspaceAttachment={() => { }}
                                onRestoreToUserMessage={async () => { }}
                                hasSnapshot={() => false}
                            />
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};
