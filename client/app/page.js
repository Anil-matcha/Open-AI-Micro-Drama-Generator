"use client";

import { useState, useEffect, useRef } from "react";
import CharacterPanel from "../components/CharacterPanel";
import ScriptSelector from "../components/ScriptSelector";
import PipelineProgress from "../components/PipelineProgress";
import VideoResult from "../components/VideoResult";
import { Clapperboard, ArrowLeft, Film } from "lucide-react";

const STYLES = [
  { value: "Cinematic", label: "Điện ảnh", desc: "Chất phim nhựa" },
  { value: "Realistic", label: "Thực tế", desc: "Tinh tế, đời" },
  { value: "Anime", label: "Anime", desc: "Hoạt hình Nhật" },
  { value: "Fantasy", label: "Siêu thực", desc: "Phép thuật & kỳ ảo" },
  { value: "Documentary", label: "Tài liệu", desc: "Phong cách báo chí" },
];

const CHARACTERS = [
  { label: "Nhân vật A", accent: "#e85d2a" },
  { label: "Nhân vật B", accent: "#7c3aed" },
];

const PHASE_INPUT = "input";
const PHASE_SELECT = "select";
const PHASE_GENERATE = "generate";

// ── SSE hook (reused by both phases) ────────────────────────────────────────
function usePipeline(jobId) {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState("running");
  const [videoUrl, setVideoUrl] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [progress, setProgress] = useState(0);
  const [currentMessage, setCurrentMessage] = useState("");
  const [logs, setLogs] = useState([]);
  const esRef = useRef(null);
  const statusRef = useRef("running");

  useEffect(() => {
    if (!jobId) return;
    statusRef.current = "running";

    const es = new EventSource(`http://localhost:8000/api/status/${jobId}`);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        setEvents((prev) => [...prev, event]);
        setLogs((prev) => [
          ...prev,
          {
            time: new Date().toLocaleTimeString(),
            message: event.message || event.stage || "",
            type: event.type,
          },
        ]);

        if (event.type === "progress") {
          setProgress(event.progress ?? 0);
          setCurrentMessage(event.message || "");
        } else if (event.type === "complete") {
          setProgress(100);
          setStatus("completed");
          setVideoUrl(event.video_url);
          setCurrentMessage("Hoàn tất tạo video!");
          es.close();
        } else if (event.type === "error") {
          setStatus("failed");
          setErrorMsg(event.message || "Tạo video thất bại");
          setCurrentMessage("Tạo video thất bại");
          es.close();
        }
      } catch (err) {
        console.error("SSE parse error:", err);
      }
    };

    es.onerror = () => {
      if (statusRef.current !== "completed") {
        fetch(`/api/result/${jobId}`)
          .then((r) => r.json())
          .then((data) => {
            if (data.status === "completed") {
              setStatus("completed");
              setVideoUrl(data.video_url);
              setProgress(100);
            } else if (data.status === "failed") {
              setStatus("failed");
              setErrorMsg(data.error || "Lỗi không xác định");
            }
          })
          .catch(() => {});
      }
      es.close();
    };

    return () => es.close();
  }, [jobId]);

  return {
    events,
    status,
    videoUrl,
    errorMsg,
    progress,
    currentMessage,
    logs,
  };
}

// ── Sub-page: pipeline progress + result ─────────────────────────────────────
function PipelinePage({ jobId, onBack }) {
  const { status, videoUrl, errorMsg, progress, currentMessage, logs, events } =
    usePipeline(jobId);

  // Extract scene metadata from the "complete" event
  const scenes = events
    .filter((e) => e.type === "complete" && Array.isArray(e.scenes))
    .map((e) => e.scenes)[0] || [];

  const badge = {
    running: {
      bg: "rgba(232,93,42,0.12)",
      border: "rgba(232,93,42,0.4)",
      color: "var(--accent)",
      dot: "var(--accent)",
      label: "Đang sản xuất",
      pulse: true,
    },
    completed: {
      bg: "rgba(34,197,94,0.12)",
      border: "rgba(34,197,94,0.4)",
      color: "#4ade80",
      dot: "#22c55e",
      label: "Bản cuối",
      pulse: false,
    },
    failed: {
      bg: "rgba(255,59,47,0.12)",
      border: "rgba(255,59,47,0.4)",
      color: "#ff8a7a",
      dot: "var(--accent-2)",
      label: "Đã dừng",
      pulse: false,
    },
  }[status];

  return (
    <main style={{ backgroundColor: "var(--bg)", minHeight: "100vh" }}>
      {/* Top bar */}
      <div
        className="sticky top-0 z-10 px-6 py-4 flex items-center gap-4"
        style={{
          backgroundColor: "rgba(245,240,232,0.95)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm transition-colors"
          style={{ color: "var(--ink-soft)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ink-soft)")}
        >
          <ArrowLeft size={16} />
          Phim mới
        </button>
        <div className="h-4 w-px" style={{ backgroundColor: "var(--line)" }} />
        <span
          className="font-mono text-sm"
          style={{ color: "var(--ink-faint)" }}
        >
          Job ·{" "}
          <span style={{ color: "var(--accent)" }}>{jobId.slice(0, 8)}…</span>
        </span>
        <div className="ml-auto">
          <span
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold"
            style={{
              backgroundColor: badge.bg,
              border: `1px solid ${badge.border}`,
              color: badge.color,
            }}
          >
            <span
              className={`w-2 h-2 rounded-full ${badge.pulse ? "rec-dot" : ""}`}
              style={{ backgroundColor: badge.dot }}
            />
            {badge.label}
          </span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {status === "completed" && videoUrl && (
          <div className="mb-10 animate-slide-up">
            <VideoResult videoUrl={videoUrl} jobId={jobId} />
          </div>
        )}
        {status === "failed" && errorMsg && (
          <div
            className="mb-10 p-5 rounded-2xl animate-slide-up"
            style={{
              backgroundColor: "rgba(255,59,47,0.08)",
              border: "1px solid rgba(255,59,47,0.35)",
            }}
          >
            <p
              className="font-serif text-sm font-semibold mb-1"
              style={{ color: "var(--accent-2)" }}
            >
              Sản xuất bị dừng
            </p>
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
              {errorMsg}
            </p>
          </div>
        )}
        <PipelineProgress
          progress={progress}
          currentMessage={currentMessage}
          status={status}
          logs={logs}
          events={events}
          scenes={scenes}
          jobId={jobId}
        />
      </div>
    </main>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [phase, setPhase] = useState(PHASE_INPUT);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [recentJobs, setRecentJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);

  // Characters — pre-loaded with reference images
  const [charAImages, setCharAImages] = useState([
    "/characters/a.png",
    "/characters/a (1).png",
  ]);
  const [charBImages, setCharBImages] = useState([
    "/characters/b.png",
    "/characters/b1.png",
  ]);
  const [charAName, setCharAName] = useState("Nhân vật A");
  const [charBName, setCharBName] = useState("Nhân vật B");

  // Form
  const [idea, setIdea] = useState("");
  const [userRequirement, setUserRequirement] = useState("");
  const [style, setStyle] = useState("Cinematic");

  // Script selection
  const [variants, setVariants] = useState([]);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [scriptsLoading, setScriptsLoading] = useState(false);

  // Pipeline (only when phase === generate)
  const [jobId, setJobId] = useState(null);
  const pipeline = usePipeline(jobId);

  // ── Load recent jobs from history ──────────────────────────────────────
  useEffect(() => {
    fetch("/api/jobs")
      .then((r) => r.json())
      .then((data) => setRecentJobs(data.jobs || []))
      .catch(() => {})
      .finally(() => setJobsLoading(false));
  }, []);

  // ── Check localStorage for pending job on mount ────────────────────────
  useEffect(() => {
    try {
      const pendingJobId = localStorage.getItem("microdrama_active_job");
      if (pendingJobId) {
        fetch(`/api/result/${pendingJobId}`)
          .then((r) => r.json())
          .then((data) => {
            if (data.status === "running" || data.status === "completed") {
              setJobId(pendingJobId);
              setPhase(PHASE_GENERATE);
            } else {
              localStorage.removeItem("microdrama_active_job");
            }
          })
          .catch(() => {});
      }
    } catch (_) {}
  }, []);

  const canGenerate = idea.trim();

  // ── Step 1: generate script variants ─────────────────────────────────────
  const handleGenerateScripts = async (e) => {
    e?.preventDefault();
    if (!canGenerate) return;

    setIsSubmitting(true);
    setError(null);
    setScriptsLoading(true);
    setSelectedVariant(null);

    try {
      const res = await fetch("/api/generate-scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea: idea.trim(),
          user_requirement: userRequirement.trim(),
          style,
          character_a_name: charAName,
          character_a_images: charAImages,
          character_b_name: charBName,
          character_b_images: charBImages,
        }),
      });
      if (!res.ok) {
        let errText = `Server error ${res.status}`;
        try {
          const err = await res.json();
          errText = err.detail || err.message || errText;
        } catch (_) {
          errText = await res.text().catch(() => errText);
        }
        throw new Error(errText);
      }
      const data = await res.json();
      setVariants(data.variants || []);
      setPhase(PHASE_SELECT);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
      setScriptsLoading(false);
    }
  };

  // ── Step 2: start per-scene video pipeline ──────────────────────────────
  const handleStartPipeline = async (variant) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/generate-scene-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variant,
          character_a_name: charAName,
          character_a_images: charAImages,
          character_b_name: charBName,
          character_b_images: charBImages,
          style,
        }),
      });
      if (!res.ok) {
        let errText = `Server error ${res.status}`;
        try {
          const err = await res.json();
          errText = err.detail || err.message || errText;
        } catch (_) {
          errText = await res.text().catch(() => errText);
        }
        throw new Error(errText);
      }
      const data = await res.json();
      setJobId(data.job_id);
      localStorage.setItem("microdrama_active_job", data.job_id);
      setPhase(PHASE_GENERATE);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Refresh jobs when returning to input phase ─────────────────────────
  useEffect(() => {
    if (phase === PHASE_INPUT) {
      setJobsLoading(true);
      fetch("/api/jobs")
        .then((r) => r.json())
        .then((data) => setRecentJobs(data.jobs || []))
        .catch(() => {})
        .finally(() => setJobsLoading(false));
    }
  }, [phase]);

  // ── Render pipeline phase ────────────────────────────────────────────────
  if (phase === PHASE_GENERATE && jobId) {
    return (
      <PipelinePage
        jobId={jobId}
        onBack={() => {
          setPhase(PHASE_INPUT);
          setJobId(null);
          localStorage.removeItem("microdrama_active_job");
        }}
      />
    );
  }

  // ── Render input or selection phase ──────────────────────────────────────
  return (
    <main style={{ backgroundColor: "var(--bg)", minHeight: "100vh" }}>
      {/* Top strip */}
      <div
        className="flex items-center justify-between px-6 py-3 sticky top-0 z-20"
        style={{
          borderBottom: "1px solid var(--line)",
          backgroundColor: "rgba(245,240,232,0.95)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #e85d2a, #c43e1a)",
              boxShadow: "0 0 14px rgba(232,93,42,0.5)",
            }}
          >
            <Clapperboard size={15} style={{ color: "#fff" }} />
          </div>
          <span
            className="font-bold tracking-tight"
            style={{ color: "var(--ink)" }}
          >
            MICRO<span style={{ color: "var(--accent)" }}>DRAMA</span>
          </span>
          <span
            className="text-[10px] uppercase tracking-[0.3em] font-mono"
            style={{ color: "var(--ink-faint)" }}
          >
            Studio
          </span>
        </div>
        <a
          href="/monitor"
          className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest transition-colors hover:text-[var(--accent)]"
          style={{ color: "var(--ink-faint)" }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          Monitor
        </a>
        <div
          className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest"
          style={{ color: "var(--ink-faint)" }}
        >
          <span
            className="rec-dot w-2 h-2 rounded-full"
            style={{ backgroundColor: "var(--accent-2)" }}
          />
          Agnes Pipeline
        </div>
      </div>

      {/* ── Phase: Input ── */}
      {phase === PHASE_INPUT && (
        <>
          {/* Hero */}
          <div className="relative overflow-hidden">
            <div
              className="absolute inset-0 pointer-events-none"
              aria-hidden="true"
              style={{
                background:
                  "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(232,93,42,0.12) 0%, transparent 65%)",
              }}
            />
            <div className="relative max-w-4xl mx-auto px-6 pt-14 pb-8 text-center">
              <p
                className="font-mono text-[11px] uppercase tracking-[0.4em] mb-6"
                style={{ color: "var(--accent)" }}
              >
                Cảnh 1 · Nội — Trí tưởng tượng
              </p>
              <h1
                className="poster-title text-5xl md:text-7xl mb-4"
                style={{
                  filter: "drop-shadow(0 12px 40px rgba(232,93,42,0.15))",
                }}
              >
                Viết<span style={{ color: "var(--accent-2)" }}>.</span>
                <br />
                Xem nó sống<span style={{ color: "var(--accent-2)" }}>.</span>
              </h1>
              <p
                className="text-sm md:text-base max-w-lg mx-auto leading-relaxed"
                style={{ color: "var(--ink-soft)" }}
              >
                Điền nhân vật, gõ ý tưởng — AI viết kịch bản, bạn chọn hướng đi, rồi dựng video.
              </p>
            </div>
          </div>

          {/* Split layout */}
          <div className="max-w-6xl mx-auto px-6 pb-20">
            {error && (
              <div
                className="mb-6 px-4 py-3 rounded-lg text-sm animate-fade-in"
                style={{
                  backgroundColor: "rgba(255,59,47,0.1)",
                  border: "1px solid rgba(255,59,47,0.35)",
                  color: "#ff8a7a",
                }}
              >
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* ── Left: Character panels ── */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Film size={14} style={{ color: "var(--accent)" }} />
                  <span
                    className="text-xs font-mono uppercase tracking-widest"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    Nhân vật chính
                  </span>
                </div>
                {CHARACTERS.map((ch, i) => (
                  <CharacterPanel
                    key={ch.label}
                    label={ch.label}
                    accent={ch.accent}
                    images={i === 0 ? charAImages : charBImages}
                    onImagesChange={i === 0 ? setCharAImages : setCharBImages}
                    compact={true}
                  />
                ))}
              </div>

              {/* ── Right: Idea form ── */}
              <div
                className="rounded-2xl overflow-hidden"
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--line)",
                  boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
                }}
              >
                <div
                  className="flex items-center justify-between px-5 py-3.5"
                  style={{ borderBottom: "1px solid var(--line)" }}
                >
                  <span
                    className="text-sm font-semibold"
                    style={{ color: "var(--ink)" }}
                  >
                    Ý tưởng & chỉ đạo
                  </span>
                  <span
                    className="font-mono text-[10px] uppercase tracking-widest"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    Bước 1 / 3
                  </span>
                </div>

                <div className="p-5 space-y-5">
                  {/* Idea */}
                  <div>
                    <label
                      className="block text-[11px] font-semibold uppercase tracking-widest mb-2"
                      style={{
                        color: "var(--ink-soft)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      Ý tưởng chính *
                    </label>
                    <textarea
                      value={idea}
                      onChange={(e) => setIdea(e.target.value)}
                      placeholder="VD: Một du hành vũ trụ cô độc phát hiện công trình người ngoài hành tinh cổ xưa trên Sao Hoả..."
                      rows={4}
                      required
                      className="w-full rounded-xl text-sm px-4 py-3 outline-none resize-y transition-all"
                      style={{
                        backgroundColor: "var(--card-2)",
                        border: "1px solid var(--line)",
                        color: "var(--ink)",
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = "var(--accent)";
                        e.target.style.boxShadow =
                          "0 0 0 3px rgba(232,93,42,0.15)";
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = "var(--line)";
                        e.target.style.boxShadow = "none";
                      }}
                    />
                  </div>

                  {/* Style */}
                  <div>
                    <label
                      className="block text-[11px] font-semibold uppercase tracking-widest mb-2"
                      style={{
                        color: "var(--ink-soft)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      Phong cách hình ảnh
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {STYLES.map((s) => {
                        const active = style === s.value;
                        return (
                          <button
                            key={s.value}
                            type="button"
                            onClick={() => setStyle(s.value)}
                            className="px-3 py-1.5 rounded-full text-xs transition-all"
                            style={{
                              backgroundColor: active
                                ? "var(--accent)"
                                : "var(--card)",
                              color: active
                                ? "var(--ink)"
                                : "var(--ink-soft)",
                              border: `1px solid ${active ? "var(--accent)" : "var(--line)"}`,
                              fontWeight: active ? "700" : "400",
                              cursor: "pointer",
                            }}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label
                      className="block text-[11px] font-semibold uppercase tracking-widest mb-2"
                      style={{
                        color: "var(--ink-soft)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      Ghi chú chỉ đạo{" "}
                      <span
                        className="normal-case font-normal"
                        style={{ color: "var(--ink-faint)" }}
                      >
                        (tuỳ chọn)
                      </span>
                    </label>
                    <textarea
                      value={userRequirement}
                      onChange={(e) => setUserRequirement(e.target.value)}
                      placeholder="Tâm trạng, nhịp độ, bảng màu, chi tiết nhân vật..."
                      rows={2}
                      className="w-full rounded-xl text-sm px-4 py-3 outline-none resize-y transition-all"
                      style={{
                        backgroundColor: "var(--card-2)",
                        border: "1px solid var(--line)",
                        color: "var(--ink)",
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = "var(--accent)";
                        e.target.style.boxShadow =
                          "0 0 0 3px rgba(232,93,42,0.15)";
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = "var(--line)";
                        e.target.style.boxShadow = "none";
                      }}
                    />
                  </div>

                  {/* Submit */}
                  <button
                    type="button"
                    onClick={handleGenerateScripts}
                    disabled={isSubmitting || !canGenerate}
                    className="w-full py-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all uppercase tracking-wider"
                    style={{
                      background: canGenerate
                        ? "linear-gradient(135deg, #e85d2a 0%, #c43e1a 100%)"
                        : "#2a2721",
                      color: canGenerate
                        ? "var(--ink)"
                        : "var(--ink-faint)",
                      cursor: canGenerate
                        ? "pointer"
                        : "not-allowed",
                      boxShadow: canGenerate
                        ? "0 6px 24px rgba(232,93,42,0.4)"
                        : "none",
                    }}
                  >
                    {isSubmitting ? (
                      <>
                        <span className="animate-spin">⟳</span>
                        Đang xử lý...
                      </>
                    ) : (
                      <>
                        <Clapperboard size={16} />
                        Tạo kịch bản
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Phase: Script Selection ── */}
      {phase === PHASE_SELECT && (
        <div>
          {/* Nav bar */}
          <div
            className="px-6 py-4 flex items-center gap-4 sticky top-[49px] z-10"
            style={{
              backgroundColor: "rgba(245,240,232,0.95)",
              backdropFilter: "blur(12px)",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <button
              onClick={() => setPhase(PHASE_INPUT)}
              className="flex items-center gap-2 text-sm transition-colors"
              style={{ color: "var(--ink-soft)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "var(--accent)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "var(--ink-soft)")
              }
            >
              <ArrowLeft size={16} />
              Quay lại
            </button>
            <div
              className="h-4 w-px"
              style={{ backgroundColor: "var(--line)" }}
            />
            <span
              className="font-mono text-sm truncate max-w-xs"
              style={{ color: "var(--ink-faint)" }}
            >
              {idea.slice(0, 40)}
              {idea.length > 40 ? "…" : ""}
            </span>
          </div>

          <ScriptSelector
            variants={variants}
            isLoading={scriptsLoading}
            onSelect={(v) => setSelectedVariant(v)}
          />

          {selectedVariant && !scriptsLoading && (
            <div className="max-w-4xl mx-auto px-6 pb-16 animate-fade-in">
              <button
                type="button"
                onClick={() => handleStartPipeline(selectedVariant)}
                disabled={isSubmitting}
                className="w-full py-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all uppercase tracking-wider"
                style={{
                  background: isSubmitting
                    ? "#2a2721"
                    : "linear-gradient(135deg, #e85d2a 0%, #c43e1a 100%)",
                  color: isSubmitting
                    ? "var(--ink-faint)"
                    : "var(--ink)",
                  cursor: isSubmitting
                    ? "not-allowed"
                    : "pointer",
                  boxShadow: isSubmitting
                    ? "none"
                    : "0 6px 24px rgba(232,93,42,0.4)",
                }}
              >
                {isSubmitting ? (
                  <>
                    <span className="animate-spin">⟳</span>
                    Đang sản xuất...
                  </>
                ) : (
                  <>
                    <Clapperboard size={16} />
                    Sản xuất phim — "{selectedVariant.title}"
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Recent Jobs Section ── */}
      {recentJobs.length > 0 && phase === PHASE_INPUT && (
        <div className="max-w-4xl mx-auto px-6 pb-10">
          <div className="flex items-center gap-2 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <span
              className="text-xs font-mono uppercase tracking-widest"
              style={{ color: "var(--ink-faint)" }}
            >
              Lịch sử tác vụ
            </span>
          </div>

          <div className="space-y-3">
            {recentJobs.slice(0, 5).map((job) => {
              const isRunning = job.status === "running";
              const isCompleted = job.status === "completed";
              const isFailed = job.status === "failed";

              return (
                <button
                  key={job.job_id}
                  onClick={() => {
                    if (isRunning || isCompleted) {
                      setJobId(job.job_id);
                      localStorage.setItem("microdrama_active_job", job.job_id);
                      setPhase(PHASE_GENERATE);
                    }
                  }}
                  disabled={!isRunning && !isCompleted}
                  className="w-full text-left rounded-xl overflow-hidden transition-all"
                  style={{
                    backgroundColor: "var(--card)",
                    border: `1px solid ${
                      isRunning ? "var(--accent)" : isCompleted ? "rgba(34,197,94,0.4)" : "var(--line)"
                    }`,
                    boxShadow: isRunning ? "0 0 16px rgba(232,93,42,0.15)" : "none",
                    cursor: isRunning || isCompleted ? "pointer" : "default",
                    opacity: isFailed ? 0.6 : 1,
                  }}
                >
                  <div className="flex items-center gap-4 px-5 py-4">
                    {/* Status indicator */}
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: isRunning
                          ? "rgba(232,93,42,0.15)"
                          : isCompleted
                          ? "rgba(34,197,94,0.15)"
                          : isFailed
                          ? "rgba(255,59,47,0.15)"
                          : "var(--bg-2)",
                      }}
                    >
                      {isRunning ? (
                        <span className="rec-dot w-3 h-3 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
                      ) : isCompleted ? (
                        <span style={{ color: "#22c55e" }}>✓</span>
                      ) : isFailed ? (
                        <span style={{ color: "#ff8a7a" }}>✗</span>
                      ) : (
                        <span style={{ color: "var(--ink-faint)" }}>—</span>
                      )}
                    </div>

                    {/* Job info */}
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-semibold truncate"
                        style={{ color: "var(--ink)" }}
                      >
                        {job.title || job.job_id.slice(0, 8)}
                      </p>
                      <p
                        className="text-[11px] font-mono"
                        style={{ color: "var(--ink-faint)" }}
                      >
                        {job.job_id.slice(0, 12)}… · {job.events_count || 0} sự kiện
                        {job.created_at && ` · ${new Date(job.created_at).toLocaleString("vi-VN")}`}
                      </p>
                    </div>

                    {/* Status badge */}
                    <span
                      className="px-3 py-1 rounded-full text-xs font-semibold flex-shrink-0"
                      style={{
                        backgroundColor: isRunning
                          ? "rgba(232,93,42,0.12)"
                          : isCompleted
                          ? "rgba(34,197,94,0.12)"
                          : isFailed
                          ? "rgba(255,59,47,0.12)"
                          : "var(--bg-2)",
                        color: isRunning
                          ? "var(--accent)"
                          : isCompleted
                          ? "#22c55e"
                          : isFailed
                          ? "#ff8a7a"
                          : "var(--ink-faint)",
                        border: `1px solid ${
                          isRunning
                            ? "rgba(232,93,42,0.4)"
                            : isCompleted
                            ? "rgba(34,197,94,0.4)"
                            : isFailed
                            ? "rgba(255,59,47,0.4)"
                            : "var(--line)"
                        }`,
                      }}
                    >
                      {isRunning ? "Đang chạy" : isCompleted ? "Hoàn thành" : isFailed ? "Thất bại" : "Không xác định"}
                    </span>

                    {/* Action */}
                    {isRunning && (
                      <span
                        className="text-xs font-mono uppercase tracking-widest flex-shrink-0"
                        style={{ color: "var(--accent)" }}
                      >
                        Tiếp tục →
                      </span>
                    )}
                    {isCompleted && job.video_url && (
                      <a
                        href={job.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-mono uppercase tracking-widest flex-shrink-0 transition-colors"
                        style={{ color: "var(--ink-faint)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ink-faint)")}
                      >
                        Xem →
                      </a>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <footer
        className="text-center pb-10 text-[11px] font-mono uppercase tracking-widest"
        style={{ color: "var(--ink-faint)" }}
      >
        MicroDrama Studio — powered by Agnes
      </footer>
    </main>
  );
}
