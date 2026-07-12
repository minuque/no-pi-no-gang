"use client";
import { AddProviderPicker } from "@/components/AddProviderPicker";
import { ProviderIcon } from "@/components/ProviderIcon";

import { useModelsConfigState } from "./useModelsConfigState";

export function ModelsConfig({ onClose }: { onClose: () => void }) {
  const {
    t,
    loading,
    saving,
    saveError,
    savedOk,
    selection,
    setSelection,
    oauthProviders,
    apiKeyProviders,
    pickerOpen,
    setPickerOpen,
    addCustomProvider,
    addModel,
    handleSave,
    providers,
    activeOAuth,
    activeApiKey,
    detailContent,
  } = useModelsConfigState();
  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1000,
          background: "rgba(0,0,0,0.40)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          style={{
            width: 860,
            height: "78vh",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              height: 44,
              flexShrink: 0,
              padding: "0 10px 0 18px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{t("modelsTitle")}</span>
              <code style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                ~/.pi/agent/models.json
              </code>
            </div>
            <button
              onClick={onClose}
              title={t("close")}
              style={{
                width: 28,
                height: 28,
                borderRadius: 4,
                border: "none",
                background: "transparent",
                color: "var(--text-muted)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "background 0.12s, color 0.12s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-hover)";
                e.currentTarget.style.color = "var(--text)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text-muted)";
              }}
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            <div
              style={{
                width: 210,
                borderRight: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                flexShrink: 0,
                background: "var(--bg-panel)",
              }}
            >
              <div style={{ flex: 1, overflowY: "auto", padding: "8px 6px" }}>
                {activeOAuth.map((p) => {
                  const isSelected = selection?.type === "oauth" && selection.providerId === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelection({ type: "oauth", providerId: p.id })}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        padding: "5px 8px",
                        borderRadius: 5,
                        cursor: "pointer",
                        background: isSelected ? "var(--bg-selected)" : "none",
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.background = "var(--bg-hover)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.background = "none";
                      }}
                    >
                      <ProviderIcon id={p.id} size={16} />
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--text)",
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.name}
                      </span>
                    </div>
                  );
                })}
                {activeApiKey.map((p) => {
                  const isSelected = selection?.type === "apikey" && selection.providerId === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelection({ type: "apikey", providerId: p.id })}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        padding: "5px 8px",
                        borderRadius: 5,
                        cursor: "pointer",
                        background: isSelected ? "var(--bg-selected)" : "none",
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.background = "var(--bg-hover)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.background = "none";
                      }}
                    >
                      <ProviderIcon id={p.id} size={16} />
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--text)",
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.displayName}
                      </span>
                    </div>
                  );
                })}
                {(activeOAuth.length > 0 || activeApiKey.length > 0) && providers.length > 0 && (
                  <div style={{ margin: "4px 8px", borderTop: "1px solid var(--border)" }} />
                )}
                {loading ? (
                  <div style={{ padding: "10px 8px", fontSize: 12, color: "var(--text-muted)" }}>
                    {t("loading")}
                  </div>
                ) : (
                  providers.map(([pName, pData]) => {
                    const isProviderSelected = selection?.type === "provider" && selection.name === pName;
                    const models = pData.models ?? [];
                    return (
                      <div key={pName} style={{ marginBottom: 2 }}>
                        <div
                          onClick={() => setSelection({ type: "provider", name: pName })}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "7px 8px",
                            borderRadius: 5,
                            cursor: "pointer",
                            background: isProviderSelected ? "var(--bg-selected)" : "none",
                          }}
                          onMouseEnter={(e) => {
                            if (!isProviderSelected) e.currentTarget.style.background = "var(--bg-hover)";
                          }}
                          onMouseLeave={(e) => {
                            if (!isProviderSelected) e.currentTarget.style.background = "none";
                          }}
                        >
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ color: "var(--text-dim)", flexShrink: 0 }}
                          >
                            <rect x="4" y="4" width="16" height="16" rx="2" />
                            <rect x="9" y="9" width="6" height="6" />
                            <line x1="9" y1="1" x2="9" y2="4" />
                            <line x1="15" y1="1" x2="15" y2="4" />
                            <line x1="9" y1="20" x2="9" y2="23" />
                            <line x1="15" y1="20" x2="15" y2="23" />
                            <line x1="20" y1="9" x2="23" y2="9" />
                            <line x1="20" y1="14" x2="23" y2="14" />
                            <line x1="1" y1="9" x2="4" y2="9" />
                            <line x1="1" y1="14" x2="4" y2="14" />
                          </svg>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: isProviderSelected ? 600 : 400,
                              color: "var(--text)",
                              fontFamily: "var(--font-mono)",
                              flex: 1,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {pName}
                          </span>
                        </div>
                        {models.map((m, i) => {
                          const isModelSelected =
                            selection?.type === "model" &&
                            selection.providerName === pName &&
                            selection.index === i;
                          return (
                            <div
                              key={i}
                              onClick={() => setSelection({ type: "model", providerName: pName, index: i })}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "5px 8px 5px 26px",
                                borderRadius: 5,
                                cursor: "pointer",
                                background: isModelSelected ? "var(--bg-selected)" : "none",
                              }}
                              onMouseEnter={(e) => {
                                if (!isModelSelected) e.currentTarget.style.background = "var(--bg-hover)";
                              }}
                              onMouseLeave={(e) => {
                                if (!isModelSelected) e.currentTarget.style.background = "none";
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 11,
                                  fontFamily: "var(--font-mono)",
                                  color: m.id ? "var(--text-muted)" : "var(--text-dim)",
                                  flex: 1,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {m.id || t("newModel")}
                              </span>
                              {m.reasoning && (
                                <span
                                  style={{
                                    fontSize: 9,
                                    padding: "1px 4px",
                                    background: "var(--accent-soft)",
                                    color: "var(--accent)",
                                    borderRadius: 3,
                                    flexShrink: 0,
                                  }}
                                >
                                  T
                                </span>
                              )}
                            </div>
                          );
                        })}
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            addModel(pName);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "4px 8px 4px 26px",
                            borderRadius: 5,
                            cursor: "pointer",
                            color: "var(--text-dim)",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = "var(--accent)";
                            e.currentTarget.style.background = "var(--bg-hover)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = "var(--text-dim)";
                            e.currentTarget.style.background = "none";
                          }}
                        >
                          <span style={{ fontSize: 11 }}>{t("addModel")}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div style={{ borderTop: "1px solid var(--border)", padding: "8px 6px" }}>
                <button
                  onClick={() => setPickerOpen(true)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 5,
                    width: "100%",
                    padding: "6px 0",
                    background: "none",
                    border: "1px dashed var(--border)",
                    borderRadius: 5,
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--accent)";
                    e.currentTarget.style.color = "var(--accent)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.color = "var(--text-muted)";
                  }}
                >
                  {t("addProvider")}
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
              {loading
                ? null
                : (detailContent ?? (
                    <div
                      style={{
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--text-dim)",
                        fontSize: 13,
                      }}
                    >
                      {t("selectProviderOrModel")}
                    </div>
                  ))}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 10,
              padding: "10px 18px",
              borderTop: "1px solid var(--border)",
              flexShrink: 0,
            }}
          >
            {saveError && <span style={{ fontSize: 12, color: "var(--danger)", flex: 1 }}>{saveError}</span>}
            <button
              onClick={handleSave}
              disabled={saving || savedOk}
              style={{
                position: "relative",
                padding: "6px 16px",
                minWidth: 92,
                background: savedOk ? "var(--success)" : saving ? "var(--bg-panel)" : "var(--accent-hover)",
                border: "none",
                borderRadius: 6,
                color: savedOk ? "var(--accent-on)" : saving ? "var(--text-muted)" : "var(--accent-on)",
                cursor: saving || savedOk ? "default" : "pointer",
                fontSize: 13,
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                transition: "background-color 0.2s ease, color 0.2s ease",
                animation: savedOk ? "saved-pop 0.45s ease" : undefined,
              }}
            >
              {savedOk && (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    strokeDasharray: 18,
                    animation: "saved-check-draw 0.35s ease forwards",
                    flexShrink: 0,
                  }}
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              <span>{savedOk ? t("saved") : saving ? t("saving") : t("save")}</span>
            </button>
          </div>
        </div>
      </div>
      {pickerOpen && (
        <AddProviderPicker
          oauthProviders={oauthProviders}
          apiKeyProviders={apiKeyProviders}
          onSelectOAuth={(id) => setSelection({ type: "oauth", providerId: id })}
          onSelectApiKey={(id) => setSelection({ type: "apikey", providerId: id })}
          onAddCustom={addCustomProvider}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}
