"use client";

interface UserAnchor {
  id: string;
  index: number;
  label: string;
  title?: string;
}

interface Props {
  visibleAnchors: UserAnchor[];
  activeAnchorId: string | null;
  panelHeight: number;
  panelOpen: boolean;
  onPanelOpenChange: (open: boolean) => void;
  onScrollTo: (id: string) => void;
}

const ANCHOR_ROW_HEIGHT = 28;
const PANEL_PADDING_Y = 14;

export function UserMessageNav({
  visibleAnchors,
  activeAnchorId,
  panelHeight,
  panelOpen,
  onPanelOpenChange,
  onScrollTo,
}: Props) {
  return (
    <nav
      className="hidden xl:flex"
      aria-label="User messages in current branch path"
      onMouseEnter={() => onPanelOpenChange(true)}
      onMouseLeave={() => onPanelOpenChange(false)}
      onFocus={() => onPanelOpenChange(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onPanelOpenChange(false);
        }
      }}
      style={{
        position: "absolute",
        right: 18,
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: 9,
        width: 42,
        height: panelHeight,
        flexDirection: "column",
        alignItems: "flex-end",
        justifyContent: "center",
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      {/* Dot track */}
      <div
        style={{
          display: "flex",
          width: 28,
          height: panelHeight,
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 0,
          padding: `${PANEL_PADDING_Y}px 0`,
          pointerEvents: "auto",
        }}
      >
        {visibleAnchors.map((anchor) => {
          const active = activeAnchorId === anchor.id;
          return (
            <button
              key={anchor.id}
              type="button"
              aria-label={`Jump to user message ${anchor.index}: ${anchor.label}`}
              aria-current={active ? "location" : undefined}
              onClick={() => onScrollTo(anchor.id)}
              style={{
                width: 20,
                height: ANCHOR_ROW_HEIGHT,
                padding: 0,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
              }}
              onMouseEnter={(e) => {
                const line = e.currentTarget.firstElementChild as HTMLElement | null;
                if (line && !active) line.style.background = "var(--text-muted)";
              }}
              onMouseLeave={(e) => {
                const line = e.currentTarget.firstElementChild as HTMLElement | null;
                if (line && !active) line.style.background = "var(--border)";
              }}
            >
              <span
                aria-hidden
                style={{
                  width: active ? 11 : 7,
                  height: active ? 3 : 2,
                  borderRadius: 9999,
                  background: active ? "var(--accent)" : "var(--border)",
                  transition: "width 0.12s ease, background 0.12s ease",
                }}
              />
            </button>
          );
        })}
      </div>

      {/* Expanded panel */}
      {panelOpen && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "50%",
            transform: "translateY(-50%)",
            width: 224,
            maxWidth: "min(224px, calc(100vw - 560px))",
            height: panelHeight,
            pointerEvents: "auto",
          }}
        >
          <style>{`
            @keyframes user-anchor-panel-in {
              from { opacity: 0; transform: translateX(12px) scale(0.98); }
              to { opacity: 1; transform: translateX(0) scale(1); }
            }
          `}</style>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 0,
              padding: `${PANEL_PADDING_Y}px 10px`,
              height: panelHeight,
              overflow: "hidden",
              borderRadius: 14,
              border: "1px solid var(--border)",
              background: "var(--bg-panel)",
              boxShadow: "var(--shadow-lg)",
              backdropFilter: "blur(14px)",
              animation: "user-anchor-panel-in 180ms cubic-bezier(.2,.8,.2,1) both",
            }}
          >
            {visibleAnchors.map((anchor) => {
              const active = activeAnchorId === anchor.id;
              return (
                <button
                  key={anchor.id}
                  type="button"
                  title={anchor.title && anchor.title !== anchor.label ? anchor.title : undefined}
                  aria-label={`Jump to user message ${anchor.index}: ${anchor.label}`}
                  aria-current={active ? "location" : undefined}
                  onClick={() => onScrollTo(anchor.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) 18px",
                    alignItems: "center",
                    gap: 12,
                    minHeight: ANCHOR_ROW_HEIGHT,
                    padding: "0 8px 0 10px",
                    border: "none",
                    borderRadius: 7,
                    background: "transparent",
                    color: active ? "var(--text)" : "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: 14,
                    lineHeight: 1.15,
                    fontWeight: active ? 500 : 400,
                    textAlign: "left",
                    letterSpacing: "-0.02em",
                    transition: "color 160ms ease, background 160ms ease, transform 160ms ease",
                  }}
                  onMouseEnter={(e) => {
                    if (active) return;
                    e.currentTarget.style.color = "var(--text)";
                    e.currentTarget.style.background = "var(--bg-hover)";
                    const marker = e.currentTarget.lastElementChild as HTMLElement | null;
                    if (marker) marker.style.background = "var(--text-dim)";
                  }}
                  onMouseLeave={(e) => {
                    if (active) return;
                    e.currentTarget.style.color = "var(--text-muted)";
                    e.currentTarget.style.background = "transparent";
                    const marker = e.currentTarget.lastElementChild as HTMLElement | null;
                    if (marker) marker.style.background = "var(--border)";
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {anchor.label}
                  </span>
                  <span
                    aria-hidden
                    style={{
                      justifySelf: "end",
                      width: active ? 13 : 10,
                      height: active ? 4 : 3,
                      borderRadius: 9999,
                      background: active ? "var(--accent)" : "var(--border)",
                      transition: "width 160ms ease, height 160ms ease, background 160ms ease",
                    }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
