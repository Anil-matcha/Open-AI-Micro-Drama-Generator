/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0b0a08",
        "bg-2": "#110f0c",
        card: "#141210",
        "card-2": "#1a1712",
        line: "#2a2721",
        ink: "#f5f1ea",
        "ink-soft": "#a89f8f",
        "ink-faint": "#6b6558",
        accent: "#ff6b35",
        "accent-2": "#ff3b2f",
      },
      fontFamily: {
        serif: ["Georgia", "Times New Roman", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      animation: {
        "slide-up": "slideUp 0.45s ease-out",
        "fade-in": "fadeIn 0.3s ease-out",
        "pulse-soft": "pulseSoft 2.5s ease-in-out infinite",
        "spin-slow": "spin 3s linear infinite",
      },
      keyframes: {
        slideUp: {
          "0%": { transform: "translateY(12px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
      },
      boxShadow: {
        glow: "0 0 24px rgba(255, 107, 53, 0.25)",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
