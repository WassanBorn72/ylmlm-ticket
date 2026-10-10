import { readFileSync } from 'node:fs';
import { collectTickets } from '../src/tickets/collector.mjs';
import { emptyState, applyResults, feedFromState } from '../src/tickets/state.mjs';

// CLI validation of the exact collector shipped in the native app. No API server.
const config = JSON.parse(readFileSync(new URL('../src/tickets/sources.json', import.meta.url), 'utf8'));
const results = await collectTickets(config);
const state = applyResults(emptyState(), results, config);
const feed = feedFromState(state, config);
console.log(JSON.stringify({ sources: feed.sources, eventCount: feed.events.length, unread: state.unreadIds.length }, null, 2));
if (results.some(result => result.status !== 'ok')) process.exitCode = 1;
