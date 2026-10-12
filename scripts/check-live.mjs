import { readFileSync } from 'node:fs';
import { collectOfficialDetails, applyOfficialResult } from '../src/tickets/official.mjs';
import { collectTickets } from '../src/tickets/collector.mjs';
import { emptyState, applyResults, feedFromState } from '../src/tickets/state.mjs';

// CLI validation of the exact collector shipped in the native app. No API server.
const config = JSON.parse(readFileSync(new URL('../src/tickets/sources.json', import.meta.url), 'utf8'));
const official = await collectOfficialDetails();
const results = await collectTickets(config, { announcements: official.announcements });
const state = applyResults(emptyState(), results, config);
state.official = applyOfficialResult(undefined, official);
const feed = feedFromState(state, config);
console.log(JSON.stringify({ sources: feed.sources, eventCount: feed.events.length, relatedPerformers: feed.events.filter(event => event.artists?.some(artist => artist.kind !== 'group')).map(event => ({ title: event.title, artists: event.artists })), unread: state.unreadIds.length, officialStatus: official.status, officialErrors: official.errors, matchedOfficialDetails: feed.events.filter(event => event.officialDetails).length }, null, 2));
if (official.status !== 'ok' || results.some(result => result.status !== 'ok')) process.exitCode = 1;
