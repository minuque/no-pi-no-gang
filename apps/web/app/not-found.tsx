export default function NotFound() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100dvh",
        gap: 12,
        background: "var(--bg)",
        color: "var(--text-muted)",
      }}
    >
      <h1 style={{ fontSize: 48, fontWeight: 600, color: "var(--text)", margin: 0 }}>404</h1>
      <p style={{ fontSize: 14, margin: 0 }}>Page not found</p>
    </div>
  );
}
