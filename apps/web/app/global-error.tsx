"use client";

export const dynamic = "force-dynamic";

export default function GlobalError() {
  return (
    <html>
      <body>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100dvh",
            gap: 12,
            background: "var(--bg)",
            color: "var(--text-dim)",
            fontFamily: "var(--font-body)",
          }}
        >
          <h1 style={{ fontSize: 24, fontWeight: 600, color: "var(--text)", margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, margin: 0 }}>Please refresh the page to try again.</p>
        </div>
      </body>
    </html>
  );
}
