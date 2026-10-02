import type { ChatMessage, ToolCall } from "../types";

export interface BenchmarkParams {
  label: string;
  textChars: number; // 总共要流式输出的助手文本字符数
  chunkChars: number; // 每个增量 delta 的字符数
  intervalMs: number; // 增量之间的间隔（0 表示尽快；实现时用 setTimeout，最小 0）
  withReasoning: boolean; // 是否同时流式输出 reasoning
  withToolCallChurn: boolean; // 是否周期性产生流式 tool_calls（制造 ToolCallViewer 渲染压力）
}

/** 与 useChat 中的 STREAM_UPDATE_INTERVAL_MS 保持一致，保证基准贴近真实节流。 */
export const BENCHMARK_STREAM_UPDATE_INTERVAL_MS = 50;

export const BENCHMARK_PRESETS: BenchmarkParams[] = [
  {
    label: "小 · 20K",
    textChars: 20000,
    chunkChars: 400,
    intervalMs: 30,
    withReasoning: false,
    withToolCallChurn: false,
  },
  {
    label: "中 · 100K",
    textChars: 100000,
    chunkChars: 600,
    intervalMs: 20,
    withReasoning: true,
    withToolCallChurn: true,
  },
  {
    label: "大 · 400K",
    textChars: 400000,
    chunkChars: 800,
    intervalMs: 8,
    withReasoning: true,
    withToolCallChurn: true,
  },
];

export interface FluencyReport {
  durationMs: number;
  frames: number;
  fps: number; // frames / durationMs*1000
  droppedFrames: number; // 帧间隔 > 50ms 的帧数
  droppedRatio: number; // droppedFrames / frames
  longestFrameMs: number;
  p95FrameMs: number;
  longTasks: number; // PerformanceObserver('longtask')
  longTaskTotalMs: number;
  worstLongTaskMs: number;
  chars: number; // 实际输出的字符数
  charsPerSecond: number;
  aborted: boolean;
}

const DROPPED_FRAME_THRESHOLD_MS = 50;
const LIVE_FPS_WINDOW_MS = 1000;

export class FluencyMonitor {
  private rafId: number | null = null;
  private observer: PerformanceObserver | null = null;
  private frameIntervals: number[] = [];
  private frameTimes: number[] = [];
  private lastFrameAt = 0;
  private startedAt = 0;
  private running = false;
  private longTasks = 0;
  private longTaskTotalMs = 0;
  private worstLongTaskMs = 0;

  start(): void {
    if (this.running) return;
    this.running = true;
    this.frameIntervals = [];
    this.frameTimes = [];
    this.lastFrameAt = 0;
    this.startedAt = performance.now();
    this.longTasks = 0;
    this.longTaskTotalMs = 0;
    this.worstLongTaskMs = 0;

    this.rafId = window.requestAnimationFrame(this.sample);

    try {
      const supported =
        typeof PerformanceObserver !== "undefined" &&
        Array.isArray((PerformanceObserver as unknown as { supportedEntryTypes?: string[] }).supportedEntryTypes) &&
        ((PerformanceObserver as unknown as { supportedEntryTypes?: string[] }).supportedEntryTypes as string[]).includes(
          "longtask",
        );

      if (supported) {
        this.observer = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            this.longTasks += 1;
            this.longTaskTotalMs += entry.duration;
            if (entry.duration > this.worstLongTaskMs) {
              this.worstLongTaskMs = entry.duration;
            }
          });
        });
        this.observer.observe({ entryTypes: ["longtask"] });
      }
    } catch {
      this.observer = null;
    }
  }

  private sample = (now: number) => {
    if (!this.running) return;

    if (this.lastFrameAt > 0) {
      this.frameIntervals.push(now - this.lastFrameAt);
    }
    this.lastFrameAt = now;

    this.frameTimes.push(now);
    const cutoff = now - LIVE_FPS_WINDOW_MS;
    while (this.frameTimes.length && this.frameTimes[0] < cutoff) {
      this.frameTimes.shift();
    }

    this.rafId = window.requestAnimationFrame(this.sample);
  };

  stop(chars: number, aborted: boolean): FluencyReport {
    const durationMs = this.startedAt > 0 ? performance.now() - this.startedAt : 0;
    this.running = false;

    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (this.observer) {
      try {
        this.observer.disconnect();
      } catch {
        // 忽略断开失败
      }
      this.observer = null;
    }

    const frames = this.frameIntervals.length;
    const fps = durationMs > 0 ? (frames / durationMs) * 1000 : 0;
    const droppedFrames = this.frameIntervals.filter((interval) => interval > DROPPED_FRAME_THRESHOLD_MS).length;
    const droppedRatio = frames > 0 ? droppedFrames / frames : 0;

    const sorted = [...this.frameIntervals].sort((a, b) => a - b);
    const longestFrameMs = sorted.length ? sorted[sorted.length - 1] : 0;
    const p95Index = sorted.length ? Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95)) : 0;
    const p95FrameMs = sorted.length ? sorted[p95Index] : 0;

    const charsPerSecond = durationMs > 0 ? (chars / durationMs) * 1000 : 0;

    return {
      durationMs,
      frames,
      fps,
      droppedFrames,
      droppedRatio,
      longestFrameMs,
      p95FrameMs,
      longTasks: this.longTasks,
      longTaskTotalMs: this.longTaskTotalMs,
      worstLongTaskMs: this.worstLongTaskMs,
      chars,
      charsPerSecond,
      aborted,
    };
  }

  getLiveFps(): number {
    if (this.frameTimes.length < 2) return 0;
    const first = this.frameTimes[0];
    const last = this.frameTimes[this.frameTimes.length - 1];
    const span = last - first;
    return span > 0 ? ((this.frameTimes.length - 1) / span) * 1000 : 0;
  }

  getElapsedMs(): number {
    return this.startedAt > 0 ? performance.now() - this.startedAt : 0;
  }
}

const BENCHMARK_CORPUS = [
  "这是一段用于性能基准的中文文本。我们希望在真实的聊天渲染管线中，观察大量字符持续流入时界面的帧率表现、长任务分布以及每一帧的耗时波动。",
  "The streaming pipeline copies the message array on every delta and flushes to React state on a 50ms throttle, so long transcripts amplify allocation and rendering cost.",
  "为了逼近真实场景，语料会在中英文之间来回切换，包含标点、数字与换行，让 Markdown 解析与文本换行都能被触发，从而得到更可信的测量结果。",
  "PerformanceObserver longtask entries reveal main-thread work longer than fifty milliseconds; fewer and shorter long tasks generally mean a smoother streaming experience for the user.",
  "在基准过程中，我们周期性制造流式工具调用，以便让工具调用预览组件参与渲染，衡量这部分子树在持续重渲染下的开销，而不会真正执行任何工具。",
  "当输出体量增长时，可以看到掉帧率、最长帧时间与卡顿次数随之变化；这些指标越低，说明流式输出的流畅度越好，界面给人的感觉也越稳定。",
];

const createId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const buildCorpus = () => BENCHMARK_CORPUS.join("\n\n");

export const runStreamingBenchmark = async (
  params: BenchmarkParams,
  options: { onMessages: (messages: ChatMessage[]) => void; signal?: AbortSignal },
): Promise<{ chars: number; aborted: boolean }> => {
  const { onMessages, signal } = options;
  const assistantIndex = 1;
  const totalChars = Math.max(1, Math.floor(params.textChars));
  const chunkSize = Math.max(1, Math.floor(params.chunkChars));
  const intervalMs = Math.max(0, Math.floor(params.intervalMs));

  let messages: ChatMessage[] = [
    { id: createId("bench-user"), role: "user", content: "【性能基准】请尽量长地输出文本。" },
    {
      id: createId("bench-assistant"),
      role: "assistant",
      content: "",
      reasoning: params.withReasoning ? "" : undefined,
    },
  ];
  onMessages([...messages]);

  const corpus = buildCorpus();
  let corpusCursor = 0;
  const takeDelta = (size: number) => {
    let out = "";
    while (out.length < size) {
      if (corpusCursor >= corpus.length) {
        corpusCursor = 0;
      }
      const need = size - out.length;
      const slice = corpus.slice(corpusCursor, corpusCursor + need);
      out += slice;
      corpusCursor += slice.length;
    }
    return out;
  };

  let chars = 0;
  let lastFlushAt = Date.now();
  let flushTimer: number | null = null;

  const flush = () => {
    lastFlushAt = Date.now();
    onMessages(messages);
  };

  const scheduleFlush = () => {
    if (flushTimer !== null) return;
    const elapsed = Date.now() - lastFlushAt;
    const delay = Math.max(0, BENCHMARK_STREAM_UPDATE_INTERVAL_MS - elapsed);
    flushTimer = window.setTimeout(() => {
      flushTimer = null;
      flush();
    }, delay);
  };

  const cancelPendingFlush = () => {
    if (flushTimer !== null) {
      window.clearTimeout(flushTimer);
      flushTimer = null;
    }
  };

  const churnEnabled = params.withToolCallChurn;
  const churnStep = churnEnabled ? Math.max(1, Math.floor(totalChars * 0.05)) : 0;
  let nextChurnAt = churnStep;

  while (chars < totalChars) {
    if (signal?.aborted) {
      cancelPendingFlush();
      flush();
      return { chars, aborted: true };
    }

    const size = Math.min(chunkSize, totalChars - chars);
    const delta = takeDelta(size);
    chars += delta.length;

    messages = messages.map((message, index) =>
      index === assistantIndex ? { ...message, content: message.content + delta } : message,
    );

    if (params.withReasoning) {
      messages = messages.map((message, index) =>
        index === assistantIndex ? { ...message, reasoning: (message.reasoning || "") + delta } : message,
      );
    }

    if (churnEnabled && chars >= nextChurnAt) {
      const toolCalls: ToolCall[] = [
        {
          id: "bench-tool-call",
          type: "function",
          function: {
            name: "benchmark_tool",
            arguments: JSON.stringify({ payload: "x".repeat(2000) }),
          },
        },
      ];
      messages = messages.map((message, index) =>
        index === assistantIndex ? { ...message, tool_calls: toolCalls } : message,
      );
      nextChurnAt += churnStep;
    }

    scheduleFlush();

    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }

  cancelPendingFlush();
  flush();
  return { chars, aborted: Boolean(signal?.aborted) };
};