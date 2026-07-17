"use client";

import { useState } from "react";

import type { PrototypeActivity } from "./prototype-data";
import { prototypeCode, prototypeDiff, prototypeRows, prototypeTasks } from "./prototype-data";
import styles from "./prototype.module.css";

export function StatusDot({ state }: { state: PrototypeActivity["state"] }) {
  return <span className={`${styles.statusDot} ${styles[state]}`} aria-label={state} />;
}

export function ThinkingBlock({ running = false }: { running?: boolean }) {
  const [open, setOpen] = useState(running);
  return (
    <section className={`${styles.thinking} ${running ? styles.thinkingRunning : ""}`}>
      <button className={styles.disclosure} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span>{running ? "Thinking" : "Thought for 12s"}</span>
        <span aria-hidden>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <p>
          I’ll preserve the existing event model, isolate the renderer, and verify that dense tool output
          stays scannable on narrow screens.
        </p>
      )}
    </section>
  );
}

export function ActivityRow({
  activity,
  openByDefault = false,
}: {
  activity: PrototypeActivity;
  openByDefault?: boolean;
}) {
  const [open, setOpen] = useState(openByDefault || activity.state === "error");
  return (
    <section className={`${styles.activity} ${styles[activity.state]}`}>
      <button
        className={styles.activitySummary}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <StatusDot state={activity.state} />
        <span className={styles.activityLabel}>{activity.label}</span>
        <span className={styles.activityDetail}>{activity.detail}</span>
        {activity.duration && <span className={styles.duration}>{activity.duration}</span>}
        <span aria-hidden>{open ? "⌃" : "⌄"}</span>
      </button>
      {open && (
        <div className={styles.activityBody}>
          {activity.state === "error"
            ? "The renderer keeps failed activities expanded so the recovery path remains visible."
            : "This detail comes from the real tool input and result; no inferred state is added."}
        </div>
      )}
    </section>
  );
}

export function DiffBlock() {
  return (
    <section className={styles.diffBlock} aria-label="File diff">
      <header>
        <span>CodexMessage.tsx</span>
        <span>+1 −1</span>
      </header>
      <pre>
        {prototypeDiff.map((line) => (
          <span className={styles[line.kind]} key={`${line.kind}-${line.text}`}>
            {line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " "} {line.text}
          </span>
        ))}
      </pre>
    </section>
  );
}

export function AnswerContent({ streaming = false }: { streaming?: boolean }) {
  return (
    <div className={styles.answer}>
      <p>
        The renderer can stay presentation-only: normalize existing blocks once, then let Claude and Codex
        surfaces choose different visual hierarchies.
        {streaming && <span className={styles.caret} aria-label="Streaming" />}
      </p>
      <pre className={styles.codeBlock}>
        <code>{prototypeCode}</code>
      </pre>
      <div className={styles.tableWrap}>
        <table>
          <tbody>
            {prototypeRows.map((row, rowIndex) => (
              <tr key={row[0]}>
                {row.map((cell, cellIndex) =>
                  rowIndex === 0 ? (
                    <th key={`${rowIndex}-${cellIndex}`}>{cell}</th>
                  ) : (
                    <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className={styles.taskList}>
        {prototypeTasks.map(([done, label]) => (
          <li key={label}>
            <input type="checkbox" checked={done} readOnly aria-label={label} /> {label}
          </li>
        ))}
      </ul>
      <div className={styles.imagePlaceholder} role="img" aria-label="Generated wireframe placeholder">
        <span>UI</span>
        <p>Generated wireframe preview</p>
      </div>
    </div>
  );
}

export function Composer({ compact = false }: { compact?: boolean }) {
  return (
    <form
      className={`${styles.composer} ${compact ? styles.composerCompact : ""}`}
      onSubmit={(event) => event.preventDefault()}
    >
      <label className={styles.srOnly} htmlFor={`prototype-prompt-${compact ? "compact" : "default"}`}>
        Message Codex
      </label>
      <textarea
        id={`prototype-prompt-${compact ? "compact" : "default"}`}
        placeholder="Ask for a follow-up…"
        rows={compact ? 1 : 2}
      />
      <div className={styles.composerToolbar}>
        <div>
          <button type="button">＋</button>
          <button type="button">GPT-5.4</button>
          <button type="button">High</button>
        </div>
        <button className={styles.sendButton} type="submit" aria-label="Send message">
          ↑
        </button>
      </div>
    </form>
  );
}
