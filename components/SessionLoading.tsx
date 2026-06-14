"use client";

export function SessionLoading() {
  return (
    <div className="session-loading">
      {/* Messages skeleton — fills viewport with realistic conversation rhythm */}
      <div className="sl-messages">
        {/* Assistant — greeting */}
        <div className="sl-msg sl-msg--left sl-msg--a">
          <div className="sl-msg-line sl-msg-line--w80" />
          <div className="sl-msg-line sl-msg-line--w65" />
        </div>

        {/* User — short question */}
        <div className="sl-msg sl-msg--right sl-msg--b">
          <div className="sl-msg-line sl-msg-line--w90" />
        </div>

        {/* Assistant — explanation */}
        <div className="sl-msg sl-msg--left sl-msg--c">
          <div className="sl-msg-line sl-msg-line--w95" />
          <div className="sl-msg-line sl-msg-line--w100" />
          <div className="sl-msg-line sl-msg-line--w70" />
        </div>

        {/* Assistant — continuation (code block hint) */}
        <div className="sl-msg sl-msg--left sl-msg--d">
          <div className="sl-msg-line sl-msg-line--w50" />
          <div className="sl-msg-line sl-msg-line--w75" />
          <div className="sl-msg-line sl-msg-line--w85" />
          <div className="sl-msg-line sl-msg-line--w40" />
        </div>

        {/* User — follow-up */}
        <div className="sl-msg sl-msg--right sl-msg--e">
          <div className="sl-msg-line sl-msg-line--w70" />
          <div className="sl-msg-line sl-msg-line--w35" />
        </div>

        {/* Assistant — final response, double-height block */}
        <div className="sl-msg sl-msg--left sl-msg--f">
          <div className="sl-msg-line sl-msg-line--w95" />
          <div className="sl-msg-line sl-msg-line--w100" />
          <div className="sl-msg-line sl-msg-line--w90" />
          <div className="sl-msg-line sl-msg-line--w85" />
          <div className="sl-msg-line sl-msg-line--w100" />
          <div className="sl-msg-line sl-msg-line--w70" />
          <div className="sl-msg-line sl-msg-line--w50" />
          <div className="sl-msg-line sl-msg-line--w35" />
        </div>

        {/* Spacer so last message doesn't sit at bottom edge */}
        <div style={{ height: 8, flexShrink: 0 }} />
      </div>

      {/* Input skeleton */}
      <div className="sl-input-wrap">
        <div className="sl-input">
          <div className="sl-input-line" />
        </div>
      </div>
    </div>
  );
}
