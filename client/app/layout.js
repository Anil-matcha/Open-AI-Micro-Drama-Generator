import "./globals.css";

export const metadata = {
  title: "ViGen — Agentic AI Video Generation",
  description:
    "Transform any idea into a complete cinematic video using a multi-agent AI pipeline powered by MuAPI.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen" style={{ backgroundColor: "#0a0a0f" }}>
        {children}
      </body>
    </html>
  );
}
