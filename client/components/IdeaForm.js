"use client";

import { useState } from "react";
import { Sparkles, Loader2, FileText, PenLine } from "lucide-react";

const STYLES = [
  { value: "Cinematic", label: "Điện ảnh", desc: "Chất phim nhựa" },
  { value: "Realistic", label: "Thực tế", desc: "Tinh tế, đời" },
  { value: "Anime", label: "Anime", desc: "Hoạt hình Nhật" },
  { value: "Fantasy", label: "Siêu thực", desc: "Phép thuật & kỳ ảo" },
  { value: "Documentary", label: "Tài liệu", desc: "Phong cách báo chí" },
];

const MODES = [
  {
    value: "idea2video",
    label: "Ý tưởng → Video",
    icon: Sparkles,
    desc: "Quy trình đầy đủ: cốt truyện, phân cảnh, storyboard, video",
  },
  {
    value: "script2video",
    label: "Kịch bản → Video",
    icon: FileText,
    desc: "Xuất phát từ kịch bản phân cảnh của bạn",
  },
];

export default function IdeaForm({ onSubmit, isSubmitting }) {
  const [idea, setIdea] = useState("");
  const [userRequirement, setUserRequirement] = useState("");
  const [style, setStyle] = useState("Cinematic");
  const [mode, setMode] = useState("idea2video");
  const [script, setScript] = useState("");

  const canSubmit =
    idea.trim() || (mode === "script2video" && script.trim());

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      idea: idea.trim(),
      user_requirement: userRequirement.trim(),
      style,
      mode,
      script: script.trim(),
    });
  };

  const fieldStyle = {
    backgroundColor: "var(--card)",
    border: "1px solid var(--line)",
    borderRadius: "10px",
    color: "var(--ink)",
    padding: "12px 14px",
    width: "100%",
    fontSize: "14px",
    outline: "none",
    resize: "vertical",
    transition: "border-color 0.2s, box-shadow 0.2s",
  };

  const labelStyle = {
    display: "block",
    fontSize: "11px",
    fontWeight: "600",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    marginBottom: "8px",
    color: "var(--ink-soft)",
    fontFamily: "var(--font-mono)",
  };

  const onFocus = (e) => {
    e.target.style.borderColor = "var(--accent)";
    e.target.style.boxShadow = "0 0 0 3px rgba(255, 107, 53, 0.15)";
  };
  const onBlur = (e) => {
    e.target.style.borderColor = "var(--line)";
    e.target.style.boxShadow = "none";
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="cine-card overflow-hidden"
    >
      {/* Slug line header */}
      <div
        className="flex items-center justify-between px-5 py-3.5"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <div className="flex items-center gap-2">
          <PenLine size={15} style={{ color: "var(--accent)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
            Bảng điều khiển sản xuất
          </span>
        </div>
        <span
          className="font-mono text-[10px] uppercase tracking-widest"
          style={{ color: "var(--ink-faint)" }}
        >
          Bản nháp 01
        </span>
      </div>

      <div className="p-5 space-y-6">
        {/* Mode selector */}
        <div>
          <span style={labelStyle}>Cách làm</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {MODES.map((m) => {
              const active = mode === m.value;
              const Icon = m.icon;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMode(m.value)}
                  className="text-left p-4 rounded-xl transition-all"
                  style={{
                    backgroundColor: active ? "rgba(255, 107, 53, 0.08)" : "var(--card)",
                    border: active ? "1.5px solid var(--accent)" : "1px solid var(--line)",
                    boxShadow: active ? "0 0 20px rgba(255, 107, 53, 0.15)" : "none",
                    cursor: "pointer",
                  }}
                >
                  <div
                    className="flex items-center gap-2 text-sm font-semibold mb-1.5"
                    style={{ color: active ? "var(--accent)" : "var(--ink)" }}
                  >
                    <Icon size={15} />
                    {m.label}
                  </div>
                  <div className="text-xs leading-relaxed" style={{ color: "var(--ink-faint)" }}>
                    {m.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Idea input */}
        <div>
          <label style={labelStyle}>
            {mode === "script2video" ? "Ý tưởng ngắn hoặc tiêu đề" : "Ý tưởng của bạn *"}
          </label>
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder={
              mode === "idea2video"
                ? "VD: Một du hành vũ trụ cô độc phát hiện một công trình người ngoài hành tinh cổ xưa trên Sao Hoả..."
                : "Tiêu đề hoặc ý tưởng chính cho video của bạn"
            }
            rows={3}
            required={mode === "idea2video"}
            style={fieldStyle}
            onFocus={onFocus}
            onBlur={onBlur}
          />
        </div>

        {/* Script input (script2video only) */}
        {mode === "script2video" && (
          <div>
            <label style={labelStyle}>Kịch bản phân cảnh *</label>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="NHÀ - NGÀY. Nhân vật cúi xuống trước công trình, tay cầm thiết bị..."
              rows={6}
              required
              style={{ ...fieldStyle, fontFamily: "var(--font-serif)" }}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </div>
        )}

        {/* Style selector */}
        <div>
          <span style={labelStyle}>Phong cách hình ảnh</span>
          <div className="flex flex-wrap gap-2">
            {STYLES.map((s) => {
              const active = style === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStyle(s.value)}
                  title={s.desc}
                  className="px-4 py-2 rounded-full text-sm transition-all"
                  style={{
                    backgroundColor: active ? "var(--accent)" : "var(--card)",
                    color: active ? "#fff" : "var(--ink-soft)",
                    border: active ? "1.5px solid var(--accent)" : "1px solid var(--line)",
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

        {/* Additional requirements */}
        <div>
          <label style={labelStyle}>
            Ghi chú chỉ đạo{" "}
            <span
              className="normal-case font-normal"
              style={{ color: "var(--ink-faint)", letterSpacing: "normal" }}
            >
              (tuỳ chọn)
            </span>
          </label>
          <textarea
            value={userRequirement}
            onChange={(e) => setUserRequirement(e.target.value)}
            placeholder="Tâm trạng, nhịp độ, bảng màu, chi tiết nhân vật, cách quay..."
            rows={2}
            style={fieldStyle}
            onFocus={onFocus}
            onBlur={onBlur}
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting || !canSubmit}
          className="w-full py-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all uppercase tracking-wider"
          style={{
            background: canSubmit
              ? "linear-gradient(135deg, #e85d2a 0%, #c43e1a 100%)"
              : "#2a2721",
            color: canSubmit ? "#fff" : "var(--ink-faint)",
            cursor: canSubmit ? "pointer" : "not-allowed",
            boxShadow: canSubmit
              ? "0 6px 24px rgba(255, 107, 53, 0.4)"
              : "none",
          }}
        >
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Đang khởi động quy trình...
            </>
          ) : (
            <>
              <Sparkles size={16} />
              Tạo video
            </>
          )}
        </button>
      </div>
    </form>
  );
}
