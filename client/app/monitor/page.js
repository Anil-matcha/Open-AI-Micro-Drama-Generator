"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Zap,
  Image as ImageIcon,
  Video,
  Clock,
  AlertCircle,
} from "lucide-react";

// ── API test card ─────────────────────────────────────────────────────────────
function ApiCard({ icon: Icon, label, desc, result, onTest }) {
  const status = result?.status || "idle";
  const isOk = status === "ok";
  const isError = status === "error";
  const isRunning = status === "running";
  const isQueueFull = status === "queue_full";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-sm">
      {/* header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-lg ${
              isOk
                ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400"
                : isError
                ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
                : isRunning
                ? "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
                : isQueueFull
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                : "bg-[var(--bg-2)] text-[var(--ink-soft)]"
            }`}
          >
            <Icon size={20} />
          </div>
          <div>
            <p className="font-semibold text-[var(--ink)]">{label}</p>
            <p className="text-xs text-[var(--ink-faint)]">{desc}</p>
          </div>
        </div>
        <button
          onClick={() => onTest(label)}
          disabled={isRunning}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
            isRunning
              ? "cursor-not-allowed border-[var(--line)] text-[var(--ink-faint)]"
              : "border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
          }`}
        >
          <RefreshCw size={14} className={isRunning ? "animate-spin" : ""} />
          {isRunning ? "Đang kiểm…" : "Test"}
        </button>
      </div>

      {/* result */}
      <div className="mt-1 rounded-lg bg-[var(--bg-2)] p-3 text-sm">
        {status === "idle" && (
          <p className="text-[var(--ink-faint)]">
            Chưa chạy — nhấn{" "}
            <span className="font-mono text-[var(--accent)]">Test</span> để kiểm tra.
          </p>
        )}

        {isRunning && (
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <Loader2 size={14} className="animate-spin" />
            <span>Đang gọi API…</span>
          </div>
        )}

        {isOk && result && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 size={15} />
              <span className="font-medium">Hoạt động tốt</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-[var(--ink-soft)]">
              <span className="flex items-center gap-1">
                <Zap size={12} />
                {result.latency_ms.toLocaleString()} ms
              </span>
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {Math.round(result.latency_ms / 1000)}s
              </span>
            </div>
            {result.response_preview && (
              <pre className="mt-1 break-all text-[11px] text-[var(--ink-faint)] font-mono bg-[var(--card)] rounded p-2">
                {result.response_preview}
              </pre>
            )}
          </div>
        )}

        {isError && result && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <XCircle size={15} />
              <span className="font-medium">Lỗi</span>
            </div>
            <p className="text-xs text-[var(--ink-soft)]">{result.error}</p>
          </div>
        )}

        {isQueueFull && result && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertCircle size={15} />
              <span className="font-medium">Đang đầy queue</span>
            </div>
            <p className="text-xs text-[var(--ink-soft)]">
              Agnes free-tier đang bận — pipeline sẽ tự retry khi chạy phim thật.
            </p>
            {result.latency_ms > 0 && (
              <div className="flex items-center gap-2 text-xs text-[var(--ink-faint)] mt-1">
                <Clock size={12} />
                Phản hồi sau {result.latency_ms.toLocaleString()} ms
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MonitorPage() {
  const [results, setResults] = useState({ llm: null, image: null, video: null });
  const [running, setRunning] = useState(null); // 'llm' | 'image' | 'video' | null
  const [overall, setOverall] = useState(null); // 'ok' | 'degraded' | null
  const [lastChecked, setLastChecked] = useState(null);

  const runAllTests = useCallback(async () => {
    setOverall(null);
    setLastChecked(null);
    try {
      const res = await fetch("/api/monitor");
      const data = await res.json();
      setResults(data.apis);
      setOverall(data.overall);
      setLastChecked(new Date());
    } catch (e) {
      setOverall("degraded");
    }
  }, []);

  const runSingleTest = useCallback(async (key) => {
    setRunning(key);
    try {
      // Re-fetch full results then update just the tested key
      const res = await fetch("/api/monitor");
      const data = await res.json();
      setResults((prev) => ({ ...prev, [key]: data.apis[key] }));
      setOverall(data.overall);
      setLastChecked(new Date());
    } catch (e) {
      setResults((prev) => ({
        ...prev,
        [key]: { status: "error", latency_ms: 0, response_preview: "", error: e.message },
      }));
    } finally {
      setRunning(null);
    }
  }, []);

  useEffect(() => {
    runAllTests();
  }, [runAllTests]);

  const statuses = Object.values(results).map((r) => r?.status);
  const allOk = statuses.every((s) => s === "ok" || s === "queue_full");
  const hasError = statuses.some((s) => s === "error");

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      {/* header */}
      <div className="border-b border-[var(--line)] bg-[var(--card)]">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-6 py-4">
          <a
            href="/"
            className="flex items-center gap-2 text-sm text-[var(--ink-faint)] hover:text-[var(--accent)] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6"/>
            </svg>
            Quay lại
          </a>
          <div className="h-5 w-px bg-[var(--line)]" />
          <h1 className="text-lg font-bold tracking-tight">Monitor API</h1>
          <div className="ml-auto flex items-center gap-3">
            {lastChecked && (
              <span className="text-xs text-[var(--ink-faint)]">
                Kiểm tra lúc {lastChecked.toLocaleTimeString("vi-VN")}
              </span>
            )}
            <button
              onClick={runAllTests}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[var(--accent-2)] active:scale-95"
            >
              <RefreshCw size={14} />
              Kiểm tra tất cả
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-8">
        {/* overall banner */}
        {overall && (
          <div
            className={`mb-6 flex items-center gap-3 rounded-xl border px-5 py-4 ${
              allOk
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-900/20 dark:text-emerald-300"
                : hasError
                ? "border-red-200 bg-red-50 text-red-800 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-300"
                : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-300"
            }`}
          >
            {allOk ? (
              <CheckCircle2 size={20} />
            ) : hasError ? (
              <XCircle size={20} />
            ) : (
              <AlertCircle size={20} />
            )}
            <div>
              <p className="font-semibold">
                {allOk
                  ? "Tất cả API hoạt động bình thường"
                  : hasError
                  ? "Một hoặc nhiều API gặp lỗi"
                  : "Một số API đang trong quá trình kiểm tra"}
              </p>
              <p className="text-sm opacity-80">
                {allOk
                  ? "LLM · Image · Video đều trả về kết quả hợp lệ."
                  : "Kiểm tra chi tiết bên dưới để xác định API bị lỗi."}
              </p>
            </div>
          </div>
        )}

        {/* cards grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <ApiCard
            icon={Zap}
            label="Text / LLM"
            desc="Agnes LLM — sinh script, hội thoại"
            result={results.llm}
            onTest={(k) => runSingleTest(k.toLowerCase())}
          />
          <ApiCard
            icon={ImageIcon}
            label="Image"
            desc="Agnes Image — tạo ảnh tham chiếu"
            result={results.image}
            onTest={(k) => runSingleTest(k.toLowerCase())}
          />
          <ApiCard
            icon={Video}
            label="Video"
            desc="Agnes Video — I2V, tạo clip"
            result={results.video}
            onTest={(k) => runSingleTest(k.toLowerCase())}
          />
        </div>

        {/* info box */}
        <div className="mt-8 rounded-xl border border-[var(--line)] bg-[var(--card)] p-5">
          <h2 className="mb-3 text-sm font-semibold text-[var(--ink-soft)] uppercase tracking-wider">
            Hướng dẫn
          </h2>
          <ul className="list-inside space-y-2 text-sm text-[var(--ink-soft)]">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-[var(--accent)]">•</span>
              Nhấn <strong>Test</strong> trên mỗi card để chạy kiểm tra riêng lẻ.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-[var(--accent)]">•</span>
              Nhấn <strong>Kiểm tra tất cả</strong> để chạy đồng thời cả 3 API.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-[var(--accent)]">•</span>
              <strong>Text/LLM</strong>: Gửi prompt ngắn, đo thời gian phản hồi.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-[var(--accent)]">•</span>
              <strong>Image</strong>: Tạo ảnh 1:1, trả về URL ảnh.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-[var(--accent)]">•</span>
              <strong>Video</strong>: Tạo clip 4s từ ảnh tham khảo (có thể mất 1–3 phút).
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
