import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';

export class Store {
  constructor(directory) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.file = join(directory, 'state.json');
    this.state = existsSync(this.file)
      ? JSON.parse(readFileSync(this.file, 'utf8'))
      : { events: {}, initializedSources: [], subscriptions: {}, outbox: [], sourceStatus: {}, lastSyncAt: null };
  }
  save() {
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    renameSync(temporary, this.file);
  }
}

export function ingest(state, source, events, now = new Date().toISOString(), finalizeBaseline = true) {
  const baseline = !state.initializedSources.includes(source.id);
  const newEvents = [];
  for (const event of events) {
    const previous = state.events[event.id];
    const keep = (previous?.offers ?? []).filter(offer => offer.sourceId !== source.id);
    state.events[event.id] = {
      ...event,
      offers: [...keep, ...event.offers],
      sourceUrls: [...new Set([...(previous?.sourceUrls ?? []), ...event.sourceUrls])],
      firstSeenAt: previous?.firstSeenAt ?? now,
      updatedAt: now,
      isBaseline: previous?.isBaseline ?? baseline,
    };
    if (!previous && !baseline) newEvents.push(state.events[event.id]);
  }
  if (baseline && finalizeBaseline) state.initializedSources.push(source.id);
  for (const event of newEvents) {
    for (const [subscriptionId, subscription] of Object.entries(state.subscriptions)) {
      state.outbox.push({ id: `${event.id}:${subscriptionId}`, eventId: event.id, subscriptionId, token: subscription.token, attempts: 0, nextAttemptAt: now });
    }
  }
  return newEvents;
}
