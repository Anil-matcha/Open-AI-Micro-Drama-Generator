"use client";

import { useRef, useEffect, useState } from "react";
import {
  FileText,
  Film,
  Video,
  Check,
  X,
  Loader2,
  Terminal,
  Play,
} from "lucide-react";

// Map stage keys → human-readable labels
const STAGE_LABELS = {
  queue: "Hàng đợi",
  concat: "Ghép cảnh & âm thanh",
  done: "Hoàn tất",
};

function sceneLabel(stage) {
  const m = stage.match(/^scene_(\d+)(?:_(img|vid|done))?$/);
  if (!m) return STAGE_LABELS[stage] || stage;
  const [, n, sub] = m;
  const num = parseInt(n, 10);
  if (sub === "img") return `Cảnh ${num + 1}: Tạo hình ảnh`;
  if (sub === "vid") return `Cảnh ${num + 1}: Tạo video`;
  if (sub === "done") return `Cảnh ${num + 1}: Hoàn thành`;
  return `Cảnh ${num + 1}`;
}

function getSceneState(events, idx) {
  // Check for done / error markers for this scene index
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    const stage = ev.stage || "";
    const m = stage.match(/^scene_(\d+)(?:_(img|vid|done))?$/);
    if (!m) continue;
    const si = parseInt(m[1], 10);
    if (si !== idx) continue;
    const sub = m[2] || "";
    if (sub === "done") return "done";
    if (ev.type === "error") return "error";
  }
  // Check if any event targets this scene
  for (const ev of events) {
    const stage = ev.stage || "";
    const m2 = stage.match(/^scene_(\d+)(?:_.+)?$/);
    if (m2 && parseInt(m2[1], 10) === idx) return "active";
  }
  return "pending";
}

function getSceneProgress(events, idx) {
  let max = 0;
  for (const ev of events) {
    const stage = ev.stage || "";
    const m = stage.match(/^scene_(\d+)(?:_.+)?$/);
    if (!m || parseInt(m[1], 10) !== idx) continue;
    if (ev.progress > max) max = ev.progress;
  }
  return max;
}

export default function PipelineProgress({
  progress,
  currentMessage,
  status,
  logs,
  events,
  scenes, // final scene metadata from complete event
  jobId,
}) {
  const logsEndRef = useRef(null);
  const [sceneStates, setSceneStates] = useState([]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    if (!events || events.length === 0) return;
    const total = scenes?.length || events.filter((e) => /^scene_\d+/.test(e.stage)).length;
    if (total === 0) return;
    const states = [];
    for (let i = 0; i < total; i++) {
      states.push({
        state: getSceneState(events, i),
        prog: getSceneProgress(events, i),
      });
    }
    setSceneStates(states);
  }, [events, scenes]);

  const sceneCount = scenes?.length || sceneStates.length;

  return (
    <div className="space-y-5">
      {/* Scene progress cards */}
      {sceneCount > 0 && (
        <div className="cine-card p-6">
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="font-serif text-lg" style={{ color: "var(--ink)" }}>
              Tiến độ từng cảnh
            </h2>
            <span
              className="font-mono text-sm font-bold"
              style={{ color: "var(--accent)" }}
            >
              {sceneStates.filter((s) => s.state === "done").length}/{sceneCount} cảnh
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: sceneCount }).map((_, i) => {
              const scene = scenes?.[i];
              const st = sceneStates[i] || { state: "pending", prog: 0 };
              const isDone = st.state === "done";
              const isError = st.state === "error";
              const isActive = st.state === "active";

              return (
                <div
                  key={i}
                  className="rounded-xl overflow-hidden transition-all"
                  style={{
                    border: `1px solid ${
                      isDone
                        ? "rgba(232,93,42,0.5)"
                        : isError
                        ? "rgba(255,59,47,0.4)"
                        : isActive
                        ? "var(--accent)"
                        : "var(--line)"
                    }`,
                    backgroundColor: "var(--card)",
                    boxShadow: isActive
                      ? "0 0 20px rgba(232,93,42,0.15)"
                      : "none",
                  }}
                >
                  <div className="flex">
                    {/* Thumbnail */}
                    <div
                      className="w-28 flex-shrink-0 relative overflow-hidden"
                      style={{
                        aspectRatio: "16/9",
                        backgroundColor: "var(--bg-2)",
                      }}
                    >
                      {scene?.visual_url ||
                      (st.prog > 0 && !isError) ? (
                        <img
                          src={
                            scene?.visual_url ||
                            `/outputs/${jobId || ""}/scenes/scene_${String(i).padStart(
                              3,
                              "0"
                            )}_thumb.jpg`
                          }
                          alt={`Cảnh ${i + 1}`}
                          className="w-full h-full object-cover"
                          style={{ opacity: isActive ? 0.6 : 1 }}
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center"
                          style={{ color: "var(--ink-faint)" }}
                        >
                          {isError ? (
                            <X size={20} />
                          ) : isActive ? (
                            <Loader2
                              size={20}
                              className="animate-spin"
                              style={{ color: "var(--accent)" }}
                            />
                          ) : (
                            <Film size={20} />
                          )}
                        </div>
                      )}
                      {/* Overlay label */}
                      <div
                        className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[10px] font-mono font-bold"
                        style={{
                          background:
                            "linear-gradient(transparent, rgba(0,0,0,0.7))",
                          color: "#fff",
                        }}
                      >
                        Cảnh {i + 1}
                      </div>
                      {isDone && (
                        <div
                          className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center"
                          style={{ background: "rgba(34,197,94,0.9)" }}
                        >
                          <Check size={11} style={{ color: "#fff" }} />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 p-3 flex flex-col justify-center gap-1.5">
                      <p
                        className="text-sm font-semibold leading-tight"
                        style={{ color: isDone ? "var(--ink)" : isError ? "var(--accent-2)" : "var(--ink-soft)" }}
                      >
                        {scene?.title || `Cảnh ${i + 1}`}
                      </p>
                      <p
                        className="text-[11px] leading-relaxed line-clamp-2"
                        style={{ color: "var(--ink-faint)" }}
                      >
                        {scene?.script?.slice(0, 80) ||
                          scene?.visual_desc?.slice(0, 80) ||
                          (isActive ? "Đang xử lý…" : "Chờ xử lý")}
                      </p>
                      {/* Progress bar */}
                      <div
                        className="h-1.5 rounded-full overflow-hidden"
                        style={{ backgroundColor: "var(--line)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${isDone ? 100 : st.prog}%`,
                            background: isDone
                              ? "linear-gradient(90deg, #22c55e, #4ade80)"
                              : isActive
                              ? "linear-gradient(90deg, var(--accent), var(--accent-2))"
                              : "var(--line)",
                          }}
                        />
                      </div>
                      <p
                        className="text-[10px] font-mono"
                        style={{
                          color: isDone
                            ? "#22c55e"
                            : isError
                            ? "#ff8a7a"
                            : "var(--ink-faint)",
                        }}
                      >
                        {isDone
                          ? "✓ Hoàn thành"
                          : isError
                          ? "✗ Lỗi"
                          : isActive
                          ? `${st.prog}%`
                          : `Cảnh ${i + 1}/${sceneCount}`}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Overall progress (only shown if no individual scene data yet) */}
      {sceneCount === 0 && (
        <div className="cine-card p-6">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-serif text-lg" style={{ color: "var(--ink)" }}>
              Tiến độ sản xuất
            </h2>
            <span
              className="font-mono text-sm font-bold"
              style={{ color: "var(--accent)" }}
            >
              {progress}%
            </span>
          </div>
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ backgroundColor: "var(--line)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                background:
                  "linear-gradient(90deg, var(--accent), var(--accent-2))",
              }}
            />
          </div>
          <p className="mt-3 text-sm" style={{ color: "var(--ink-soft)" }}>
            {currentMessage}
          </p>
        </div>
      )}

      {/* Live logs */}
      {logs.length > 0 && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            backgroundColor: "var(--bg-2)",
            border: "1px solid var(--line)",
          }}
        >
          <div
            className="px-4 py-3 flex items-center gap-2"
            style={{ borderBottom: "1px solid var(--line)" }}
          >
            <Terminal size={13} style={{ color: "var(--accent)" }} />
            <div
              className="rec-dot w-2 h-2 rounded-full"
              style={{ backgroundColor: "#22c55e" }}
            />
            <span
              className="text-[11px] font-mono uppercase tracking-widest"
              style={{ color: "var(--ink-faint)" }}
            >
              Nhật ký quy trình
            </span>
          </div>
          <div
            className="p-4 max-h-48 overflow-y-auto font-mono text-xs space-y-1"
            style={{ color: "var(--ink-soft)" }}
          >
            {logs.map((log, i) => (
              <div
                key={i}
                className="flex gap-3"
                style={{
                  color:
                    log.type === "complete"
                      ? "#4ade80"
                      : log.type === "error"
                      ? "#ff8a7a"
                      : "var(--ink-soft)",
                }}
              >
                <span
                  style={{ color: "var(--ink-faint)", flexShrink: 0 }}
                  className="timecode"
                >
                  {log.time}
                </span>
                <span>{log.message}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}
