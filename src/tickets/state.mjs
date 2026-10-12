import { enrichWithOfficialDetails } from './official.mjs';
export const emptyState = () => ({ version: 1, snapshots: {}, seen: {}, unreadIds: [], lastSyncAt: null });

export function parseState(raw) {
  if (!raw) return emptyState();
  const state = JSON.parse(raw);
  if (state.version !== 1 || !state.snapshots || !state.seen || !Array.isArray(state.unreadIds)) throw new Error('保存した情報の形式が不正です');
  if (!state.unreadIds.every(id => typeof id === 'string') ||
    Object.values(state.snapshots).some(snapshot => !snapshot || !Array.isArray(snapshot.events) || !Array.isArray(snapshot.errors) || snapshot.events.some(event => !event || typeof event.id !== 'string' || typeof event.date !== 'string' || typeof event.title !== 'string' || typeof event.venue !== 'string' || !Array.isArray(event.offers) || !Array.isArray(event.sourceUrls))) ||
    Object.values(state.seen).some(item => !item || typeof item.date !== 'string' || typeof item.firstSeenAt !== 'string')) throw new Error('保存した情報の形式が不正です');
  if (state.official && (!Array.isArray(state.official.announcements) || !Array.isArray(state.official.errors) || state.official.announcements.some(item => !item || typeof item.date !== 'string' || typeof item.title !== 'string' || typeof item.venue !== 'string' || typeof item.text !== 'string' || !['ticketUrls', 'performance', 'meetAndGreet'].every(field => Array.isArray(item[field]) && item[field].every(value => typeof value === 'string'))))) delete state.official;
  return state;
}

const todayInJapan = now => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
const sortEvents = events => events.sort((a, b) => a.date.localeCompare(b.date) || (a.startAt ?? '').localeCompare(b.startAt ?? ''));

export function mergeEvents(events) {
  const merged = new Map();
  for (const event of events) {
    const previous = merged.get(event.id);
    if (!previous) { merged.set(event.id, event); continue; }
    merged.set(event.id, {
      ...event, venue: previous.venue.length > event.venue.length ? previous.venue : event.venue,
      address: event.address || previous.address, doorsAt: event.doorsAt || previous.doorsAt,
      offers: [...previous.offers, ...event.offers], notes: [...(previous.notes ?? []), ...(event.notes ?? [])],
      sourceUrls: [...new Set([...previous.sourceUrls, ...event.sourceUrls])],
    });
  }
  return sortEvents([...merged.values()]);
}

// Successful snapshots replace listings. A failed source keeps its previous
// snapshot; partial results replace only pages actually read and add new pages.
export function applyResults(previous, results, config, now = new Date().toISOString()) {
  const next = { ...previous, snapshots: { ...previous.snapshots }, seen: { ...previous.seen }, unreadIds: [...previous.unreadIds], lastSyncAt: now };
  const today = todayInJapan(now);
  const unread = new Set(next.unreadIds);
  for (const result of results) {
    const old = previous.snapshots[result.sourceId];
    const events = result.events.filter(event => event.date >= today);
    const baseline = !old?.initialized;
    for (const event of events) {
      // Use the previous cycle, not an earlier site in this cycle: site order
      // must not hide a new event on an already initialized source.
      if (!previous.seen[event.id] && !baseline) unread.add(event.id);
      if (!next.seen[event.id]) {
        next.seen[event.id] = { date: event.date, firstSeenAt: now };
      }
    }
    const replacement = new Map((result.status === 'ok' ? [] : old?.events ?? []).map(event => [event.id, event]));
    for (const event of events) replacement.set(event.id, event);
    next.snapshots[result.sourceId] = {
      ...result, events: [...replacement.values()].filter(event => event.date >= today),
      initialized: old?.initialized || result.status === 'ok',
      lastSuccessAt: result.status === 'ok' ? now : old?.lastSuccessAt ?? null,
    };
  }
  // Keep only current configured sources and upcoming IDs; reinstall starts a new baseline.
  const activeSources = new Set(config.sources.map(source => source.id));
  next.snapshots = Object.fromEntries(Object.entries(next.snapshots).filter(([id]) => activeSources.has(id)));
  next.seen = Object.fromEntries(Object.entries(next.seen).filter(([, item]) => item.date >= today));
  next.unreadIds = [...unread].filter(id => next.seen[id]);
  return next;
}

export function feedFromState(state, config, now = new Date().toISOString()) {
  const today = todayInJapan(now);
  const events = mergeEvents(config.sources.flatMap(source => {
    const snapshot = state.snapshots[source.id];
    return (snapshot?.events ?? []).filter(event => event.date >= today).map(event => ({
      ...event, staleSourceIds: snapshot.status !== 'ok' ? [source.id] : [],
      firstSeenAt: state.seen[event.id]?.firstSeenAt ?? snapshot.checkedAt,
      updatedAt: snapshot.status === 'ok' ? snapshot.checkedAt : snapshot.lastSuccessAt ?? snapshot.checkedAt,
      isBaseline: !state.unreadIds.includes(event.id),
    }));
  }));
  // Collect stale provenance after merging offers from multiple sources.
  for (const event of events) event.staleSourceIds = config.sources.filter(source => state.snapshots[source.id]?.status !== 'ok' && event.offers.some(offer => offer.sourceId === source.id)).map(source => source.id);
  return { events: enrichWithOfficialDetails(events, state.official), lastSyncAt: state.lastSyncAt, sources: config.sources.map(source => {
    const snapshot = state.snapshots[source.id];
    return { id: source.id, name: source.name, status: snapshot?.status ?? 'pending', errors: snapshot?.errors ?? [], checkedAt: snapshot?.checkedAt, found: snapshot?.found, lastSuccessAt: snapshot?.lastSuccessAt };
  }) };
}

export const markAllRead = state => ({ ...state, unreadIds: [] });
