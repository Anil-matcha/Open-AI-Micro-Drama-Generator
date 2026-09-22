"use client";

import { useState } from "react";
import { Film, Check, Loader2 } from "lucide-react";

export default function ScriptSelector({ variants, onSelect, isLoading }) {
  const [selected, setSelected] = useState(null);

  const handleSelect = (v) => {
    setSelected(v.variant_id);
    onSelect(v);
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 animate-fade-in">
      {/* Header */}
      <div className="text-center mb-10">
        <p
          className="font-mono text-[11px] uppercase tracking-[0.4em] mb-4"
          style={{ color: "var(--accent)" }}
        >
          Giai đoạn 2 · Chọn kịch bản
        </p>
        <h2
          className="text-3xl md:text-4xl font-black tracking-tight mb-3"
          style={{ filter: "drop-shadow(0 8px 24px rgba(232,93,42,0.12))" }}
        >
          Gợi ý <span style={{ color: "var(--accent-2)" }}>kịch bản</span>
        </h2>
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          AI đã tạo {variants?.length || 0} phương án. Chọn một để tiếp tục sản xuất.
        </p>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div
          className="flex flex-col items-center justify-center py-24 rounded-2xl"
          style={{ border: "1px solid var(--line)", backgroundColor: "var(--card)" }}
        >
          <Loader2 size={32} className="animate-spin mb-4" style={{ color: "var(--accent)" }} />
          <p className="text-sm font-mono uppercase tracking-widest" style={{ color: "var(--ink-soft)" }}>
            Đang viết kịch bản...
          </p>
          <p className="text-xs mt-2" style={{ color: "var(--ink-faint)" }}>
            AI đang sáng tạo 3 hướng kể chuyện khác nhau
          </p>
        </div>
      )}

      {/* Variant cards */}
      {!isLoading && variants && variants.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {variants.map((v) => (
            <button
              key={v.variant_id}
              type="button"
              onClick={() => handleSelect(v)}
              className="text-left rounded-2xl overflow-hidden transition-all hover:scale-[1.02]"
              style={{
                background:
                  selected === v.variant_id
                    ? "linear-gradient(160deg, rgba(232,93,42,0.15) 0%, var(--card) 60%)"
                    : "linear-gradient(160deg, rgba(0,0,0,0.02) 0%, var(--card) 60%)",
                border:
                  selected === v.variant_id
                    ? "1.5px solid var(--accent)"
                    : "1px solid var(--line)",
                boxShadow:
                  selected === v.variant_id
                    ? "0 0 30px rgba(232,93,42,0.18), 0 8px 24px rgba(0,0,0,0.1)"
                    : "0 4px 16px rgba(0,0,0,0.06)",
                cursor: "pointer",
              }}
            >
              {/* Card header */}
              <div
                className="px-5 py-4"
                style={{ borderBottom: "1px solid var(--line)" }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black"
                    style={{ background: "var(--accent)", color: "#fff" }}
                  >
                    {v.variant_id}
                  </span>
                  <span
                    className="font-mono text-[10px] uppercase tracking-widest"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    Phương án {v.variant_id}
                  </span>
                  {selected === v.variant_id && (
                    <Check size={14} style={{ color: "var(--accent)", marginLeft: "auto" }} />
                  )}
                </div>
                <h3
                  className="text-base font-bold leading-tight"
                  style={{ color: "var(--ink)" }}
                >
                  {v.title}
                </h3>
              </div>

              {/* Logline */}
              <div className="px-5 py-3">
                <p
                  className="text-xs leading-relaxed italic"
                  style={{ color: "var(--ink-soft)" }}
                >
                  "{v.logline}"
                </p>
              </div>

              {/* Scenes list */}
              <div className="px-5 pb-4">
                <p
                  className="text-[10px] font-mono uppercase tracking-widest mb-3"
                  style={{ color: "var(--ink-faint)" }}
                >
                  {v.scenes.length} cảnh
                </p>
                <div className="space-y-2">
                  {v.scenes.map((s, i) => (
                    <div
                      key={i}
                      className="flex gap-3 items-start"
                    >
                      <span
                        className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold mt-0.5"
                        style={{
                          backgroundColor: "var(--card-2)",
                          border: "1px solid var(--line)",
                          color: "var(--ink-faint)",
                        }}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p
                          className="text-xs font-semibold truncate"
                          style={{ color: "var(--ink)" }}
                        >
                          {s.title}
                        </p>
                        <p
                          className="text-[10px] truncate"
                          style={{ color: "var(--ink-faint)" }}
                        >
                          {s.audio_desc.slice(0, 60)}...
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Selected highlight bar */}
              {selected === v.variant_id && (
                <div
                  className="h-1 w-full"
                  style={{ background: "linear-gradient(90deg, var(--accent), var(--accent-2))" }}
                />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && (!variants || variants.length === 0) && (
        <div
          className="text-center py-20 rounded-2xl"
          style={{ border: "1px solid var(--line)", backgroundColor: "var(--card)" }}
        >
          <Film size={32} style={{ color: "var(--ink-faint)", marginBottom: 12 }} />
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            Không tạo được kịch bản. Vui lòng thử lại.
          </p>
        </div>
      )}
    </div>
  );
}
