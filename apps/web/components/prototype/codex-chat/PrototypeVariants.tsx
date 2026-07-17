import { ActivityRow, AnswerContent, Composer, DiffBlock, StatusDot, ThinkingBlock } from "./PrototypeAtoms";
import { prototypeActivities } from "./prototype-data";
import styles from "./prototype.module.css";

function UserPrompt() {
  return (
    <p className={styles.userPrompt}>
      Add a Codex chat style without changing the existing Claude experience.
    </p>
  );
}

export function NarrativeVariant() {
  return (
    <div className={`${styles.variant} ${styles.narrative}`}>
      <div className={styles.conversationColumn}>
        <UserPrompt />
        <ThinkingBlock />
        <div className={styles.activityStack}>
          {prototypeActivities.slice(0, 2).map((activity) => (
            <ActivityRow activity={activity} key={activity.label} />
          ))}
          <ActivityRow activity={prototypeActivities[2]} openByDefault />
          <DiffBlock />
          <ActivityRow activity={prototypeActivities[3]} openByDefault />
          <ActivityRow activity={prototypeActivities[4]} />
        </div>
        <AnswerContent streaming />
        <Composer />
      </div>
    </div>
  );
}

export function LedgerVariant() {
  return (
    <div className={`${styles.variant} ${styles.ledger}`}>
      <aside className={styles.ledgerRail} aria-label="Execution ledger">
        <header>
          <span>Execution</span>
          <strong>4 / 5</strong>
        </header>
        <ThinkingBlock />
        <ol>
          {prototypeActivities.map((activity) => (
            <li key={activity.label}>
              <StatusDot state={activity.state} />
              <div>
                <strong>{activity.label}</strong>
                <span>{activity.detail}</span>
              </div>
            </li>
          ))}
        </ol>
      </aside>
      <main className={styles.ledgerMain}>
        <UserPrompt />
        <h1>Renderer boundary is viable</h1>
        <AnswerContent />
        <details className={styles.ledgerDetails} open>
          <summary>1 file changed</summary>
          <DiffBlock />
        </details>
        <Composer />
      </main>
    </div>
  );
}

export function TranscriptVariant() {
  return (
    <div className={`${styles.variant} ${styles.transcript}`}>
      <div className={styles.transcriptColumn}>
        <div className={styles.transcriptMeta}>USER · 10:42</div>
        <UserPrompt />
        <div className={styles.transcriptMeta}>CODEX · WORKING</div>
        <ThinkingBlock running />
        <div className={styles.compactLog}>
          {prototypeActivities.map((activity) => (
            <ActivityRow activity={activity} key={activity.label} />
          ))}
        </div>
        <DiffBlock />
        <div className={styles.transcriptMeta}>CODEX · STREAMING</div>
        <AnswerContent streaming />
      </div>
      <Composer compact />
    </div>
  );
}
