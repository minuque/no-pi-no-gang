import type { RuntimeEvent } from "@no-pi-no-gang/agent-protocol";

export interface SequencedRuntimeEvent {
  id: number;
  event: RuntimeEvent;
}

interface Subscriber {
  onEvent(event: SequencedRuntimeEvent): void;
  onClose?(): void;
}

export class EventBus {
  private readonly streams = new Map<
    string,
    { nextId: number; events: SequencedRuntimeEvent[]; subscribers: Set<Subscriber> }
  >();

  constructor(private readonly replayLimit = 256) {}

  publish(sessionId: string, event: RuntimeEvent): SequencedRuntimeEvent {
    const stream = this.getStream(sessionId);
    const sequenced = { id: stream.nextId++, event };
    stream.events.push(sequenced);
    if (stream.events.length > this.replayLimit) stream.events.shift();
    for (const subscriber of stream.subscribers) {
      try {
        subscriber.onEvent(sequenced);
      } catch {}
    }
    return sequenced;
  }

  subscribe(
    sessionId: string,
    afterId: number,
    onEvent: Subscriber["onEvent"],
    onClose?: Subscriber["onClose"],
  ): () => void {
    const stream = this.getStream(sessionId);
    const subscriber = { onEvent, onClose };
    const oldest = stream.events[0]?.id;
    if (afterId > 0 && oldest !== undefined && afterId < oldest - 1) {
      try {
        onEvent({
          id: oldest - 1,
          event: { type: "replay_gap", afterId, oldestAvailableId: oldest },
        });
      } catch {}
    }
    for (const event of stream.events) {
      if (event.id <= afterId) continue;
      try {
        onEvent(event);
      } catch {}
    }
    stream.subscribers.add(subscriber);
    return () => stream.subscribers.delete(subscriber);
  }

  closeSession(sessionId: string): void {
    const stream = this.streams.get(sessionId);
    if (!stream) return;
    for (const subscriber of stream.subscribers) {
      try {
        subscriber.onClose?.();
      } catch {}
    }
    stream.subscribers.clear();
    this.streams.delete(sessionId);
  }

  close(): void {
    for (const sessionId of [...this.streams.keys()]) this.closeSession(sessionId);
  }

  private getStream(sessionId: string) {
    let stream = this.streams.get(sessionId);
    if (!stream) {
      stream = { nextId: 1, events: [], subscribers: new Set<Subscriber>() };
      this.streams.set(sessionId, stream);
    }
    return stream;
  }
}
