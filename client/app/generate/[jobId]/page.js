"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import PipelineProgress from "../../../components/PipelineProgress";
import VideoResult from "../../../components/VideoResult";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function GeneratePage() {
  const { jobId } = useParams();
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState("running"); // running | completed | failed
  const [videoUrl, setVideoUrl] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [progress, setProgress] = useState(0);
  const [currentMessage, setCurrentMessage] = useState("Đang khởi động quy trình...");
  const [logs, setLogs] = useState([]);
  const esRef = useRef(null);

  useEffect(() => {
    if (!jobId) return;

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
          setProgress(event.progress || 0);
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
        console.error("Không giải được sự kiện SSE:", err);
      }
    };

    es.onerror = () => {
      if (status !== "completed") {
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

    return () => {
      es.close();
    };
  }, [jobId]);

  const badge = {
    running: {
      bg: "rgba(255, 107, 53, 0.12)",
      border: "rgba(255, 107, 53, 0.4)",
      color: "var(--accent)",
      dot: "var(--accent)",
      label: "Đang sản xuất",
      pulse: true,
    },
    completed: {
      bg: "rgba(34, 197, 94, 0.12)",
      border: "rgba(34, 197, 94, 0.4)",
      color: "#4ade80",
      dot: "#22c55e",
      label: "Bản cuối",
      pulse: false,
    },
    failed: {
      bg: "rgba(255, 59, 47, 0.12)",
      border: "rgba(255, 59, 47, 0.4)",
      color: "#ff8a7a",
      dot: "var(--accent-2)",
      label: "Đã dừng",
      pulse: false,
    },
  }[status];

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: "var(--bg)" }}
    >
      {/* Top bar */}
      <div
        className="sticky top-0 z-10 px-6 py-4 flex items-center gap-4"
        style={{
          backgroundColor: "rgba(11, 10, 8, 0.88)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <Link
          href="/"
          className="flex items-center gap-2 text-sm transition-colors"
          style={{ color: "var(--ink-soft)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ink-soft)")}
        >
          <ArrowLeft size={16} />
          Phim mới
        </Link>
        <div className="h-4 w-px" style={{ backgroundColor: "var(--line)" }} />
        <span className="font-mono text-sm" style={{ color: "var(--ink-faint)" }}>
          Job · <span style={{ color: "var(--accent)" }}>{jobId}</span>
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
              className={`w-2 h-2 rounded-full ${
                badge.pulse ? "rec-dot" : ""
              }`}
              style={{ backgroundColor: badge.dot }}
            />
            {badge.label}
          </span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Result */}
        {status === "completed" && videoUrl && (
          <div className="mb-10 animate-slide-up">
            <VideoResult videoUrl={videoUrl} jobId={jobId} />
          </div>
        )}

        {/* Error */}
        {status === "failed" && errorMsg && (
          <div
            className="mb-10 p-5 rounded-2xl animate-slide-up"
            style={{
              backgroundColor: "rgba(255, 59, 47, 0.08)",
              border: "1px solid rgba(255, 59, 47, 0.35)",
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

        {/* Pipeline progress */}
        <PipelineProgress
          progress={progress}
          currentMessage={currentMessage}
          status={status}
          logs={logs}
        />
      </div>
    </main>
  );
}
