import "./globals.css";

export const metadata = {
  title: "MicroDrama AI — Studio Phim Vi Mô",
  description:
    "Đưa một ý tưởng trở thành phim hoàn chỉnh bằng pipeline AI đa agent.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body
        className="antialiased min-h-screen film-grain"
        style={{
          backgroundColor: "var(--bg)",
          color: "var(--ink)",
          fontFamily: "var(--font-sans)",
        }}
      >
        {children}
      </body>
    </html>
  );
}
