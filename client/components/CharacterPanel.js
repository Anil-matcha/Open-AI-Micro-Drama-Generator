"use client";

import { useState, useRef } from "react";
import { Upload, X, User } from "lucide-react";

const PLACEHOLDER = [null, null];

export default function CharacterPanel({
  label,
  accent = "#e85d2a",
  images = [],
  onImagesChange,
  compact = false,
}) {
  const [localImages, setLocalImages] = useState(images.length ? images : PLACEHOLDER);
  const fileRefs = [useRef(null), useRef(null)];

  const readAndSet = (idx, result) => {
    const next = [...localImages];
    next[idx] = result;
    setLocalImages(next);
    onImagesChange(next.filter(Boolean));
  };

  const handleDrop = (idx, e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (ev) => readAndSet(idx, ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleFileSelect = (idx, e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => readAndSet(idx, ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemove = (idx) => {
    const next = [...localImages];
    next[idx] = null;
    setLocalImages(next);
    onImagesChange(next.filter(Boolean));
  };

  const imgCount = localImages.filter(Boolean).length;

  return (
    <div
      className="rounded-2xl overflow-hidden transition-shadow hover:shadow-lg"
      style={{
        background: "var(--card)",
        border: "1px solid var(--line)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${accent}, ${accent}99)` }}
        >
          <User size={14} style={{ color: "#fff" }} />
        </div>
        <span
          className="text-sm font-bold tracking-wide"
          style={{ color: "var(--ink)" }}
        >
          {label}
        </span>
        {imgCount > 0 && (
          <span
            className="text-[10px] font-mono uppercase tracking-wider ml-auto"
            style={{ color: "var(--ink-faint)" }}
          >
            {imgCount}/2
          </span>
        )}
      </div>

      {/* Image slots — horizontal when compact */}
      <div
        className="px-4 pt-4"
        style={{
          display: "flex",
          gap: "10px",
        }}
      >
        {localImages.map((img, idx) => (
          <div
            key={idx}
            className="relative group flex-1 min-w-0"
            style={compact ? { maxWidth: "50%" } : {}}
          >
            <input
              ref={fileRefs[idx]}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFileSelect(idx, e)}
            />
            {img ? (
              <div
                className={`relative rounded-xl overflow-hidden cursor-pointer ${
                  compact ? "aspect-square" : "aspect-[3/4]"
                }`}
                onDrop={(e) => handleDrop(idx, e)}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileRefs[idx].current?.click()}
              >
                <img
                  src={img}
                  alt={`${label} ref ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
                {/* Hover overlay */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5"
                  style={{ background: "rgba(0,0,0,0.5)" }}
                >
                  <Upload size={14} style={{ color: "#fff" }} />
                  <span
                    className="text-[10px] font-mono uppercase tracking-wider"
                    style={{ color: "#fff" }}
                  >
                    Đổi
                  </span>
                </div>
                {/* Remove btn */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(idx);
                  }}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                  style={{ background: "rgba(200,50,30,0.9)", color: "#fff" }}
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRefs[idx].current?.click()}
                onDrop={(e) => handleDrop(idx, e)}
                onDragOver={(e) => e.preventDefault()}
                className={`w-full rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 transition-all hover:scale-[1.02] ${
                  compact ? "aspect-square" : "aspect-[3/4]"
                }`}
                style={{
                  borderColor: "var(--line)",
                  color: "var(--ink-faint)",
                  background: "var(--card-2)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = accent;
                  e.currentTarget.style.color = accent;
                  e.currentTarget.style.background = `${accent}0a`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--line)";
                  e.currentTarget.style.color = "var(--ink-faint)";
                  e.currentTarget.style.background = "var(--card-2)";
                }}
              >
                <Upload size={compact ? 16 : 20} />
                <span
                  className="text-[10px] font-mono uppercase tracking-wider"
                  style={compact ? {} : { fontSize: "11px" }}
                >
                  {compact ? "Ảnh" : "Thả ảnh ở đây"}
                </span>
                {!compact && (
                  <span
                    className="text-[10px]"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    JPG, PNG · tùy chọn
                  </span>
                )}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Name input */}
      <div className="px-4 pb-4 pt-3">
        <label
          className="text-[10px] font-mono uppercase tracking-widest block mb-1.5"
          style={{ color: "var(--ink-faint)" }}
        >
          Tên nhân vật
        </label>
        <input
          type="text"
          defaultValue={label}
          className="w-full rounded-lg text-sm px-3 py-2 outline-none transition-all"
          style={{
            backgroundColor: "var(--card-2)",
            border: "1px solid var(--line)",
            color: "var(--ink)",
          }}
          onFocus={(e) => {
            e.target.style.borderColor = accent;
            e.target.style.boxShadow = `0 0 0 3px ${accent}22`;
          }}
          onBlur={(e) => {
            e.target.style.borderColor = "var(--line)";
            e.target.style.boxShadow = "none";
          }}
        />
      </div>
    </div>
  );
}
