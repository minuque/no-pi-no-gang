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
            background: "#111113",
            color: "#b8b8b8",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h1 style={{ fontSize: 24, fontWeight: 600, color: "#d4d4d4", margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, margin: 0 }}>
            Please refresh the page to try again.
          </p>
        </div>
      </body>
    </html>
  );
}
