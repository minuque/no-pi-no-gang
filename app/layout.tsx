import type { Metadata } from "next";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/400-italic.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/600-italic.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/jetbrains-mono/700-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pi Agent Web",
  description: "Pi Coding Agent Web Interface",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("pi-theme");if(t==="light"){document.documentElement.classList.add("light");document.documentElement.classList.remove("dark")}else{document.documentElement.classList.add("dark");document.documentElement.classList.remove("light")}}catch(e){}})();`,
          }}
        />
      </head>
      <body style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
        <a href="#main" className="skip-link">Skip to main content</a>
        <div id="main" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {children}
        </div>
      </body>
    </html>
  );
}
