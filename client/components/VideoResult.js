"use client";

import { useState } from "react";
import { Download, ExternalLink, Check, Play } from "lucide-react";

export default function VideoResult({ videoUrl, jobId }) {
  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `microdrama-${jobId}.mp4`;
    a.click();
  };

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "linear-gradient(160deg, rgba(232,93,42,0.05) 0%, var(--card) 40%)",
        border: "1px solid rgba(255, 107, 53, 0.35)",
        boxShadow: "0 0 50px rgba(255, 107, 53, 0.12)",
      }}
    >
      {/* Header */}
      <div
        className="px-5 py-4 flex items-center gap-3"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, #e85d2a, #c43e1a)",
            boxShadow: "0 0 16px rgba(255, 107, 53, 0.4)",
          }}
        >
          <Check size={17} style={{ color: "var(--ink)" }} />
        </div>
        <div>
          <h2 className="font-serif text-base" style={{ color: "var(--ink)" }}>
            Phim của bạn đã sẵn sàng
          </h2>
          <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
            Bản dựng cuối · MicroDrama Studio
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              backgroundColor: "var(--card)",
              border: "1px solid var(--line)",
              color: "var(--ink-soft)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.color = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--line)";
              e.currentTarget.style.color = "var(--ink-soft)";
            }}
          >
            <ExternalLink size={12} />
            Mở
          </a>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
            style={{
              background: "linear-gradient(135deg, #e85d2a 0%, #c43e1a 100%)",
              color: "var(--ink)",
              border: "none",
              cursor: "pointer",
              boxShadow: "0 2px 12px rgba(255, 107, 53, 0.4)",
            }}
          >
            <Download size={12} />
            Tải xuống
          </button>
        </div>
      </div>

      {/* Video player */}
      <div style={{ backgroundColor: "#000", aspectRatio: "16/9" }}>
        <video
          src={videoUrl}
          controls
          autoPlay
          loop
          className="w-full h-full"
          style={{ display: "block" }}
        />
      </div>

      {/* Footer */}
      <div
        className="px-5 py-3 flex items-center justify-between"
        style={{ borderTop: "1px solid var(--line)" }}
      >
        <span className="text-xs" style={{ color: "var(--ink-faint)" }}>
          Mã job:{" "}
          <span className="font-mono" style={{ color: "var(--ink-soft)" }}>
            {jobId}
          </span>
        </span>
        <span className="text-xs font-mono uppercase tracking-wider" style={{ color: "var(--ink-faint)" }}>
          Powered by Agnes
        </span>
      </div>
    </div>
  );
}
