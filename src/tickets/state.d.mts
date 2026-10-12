import type { Feed, TicketEvent } from '../types';
import type { OfficialSnapshot } from './official.mjs';
import type { Config, SourceResult } from './collector.mjs';
export type DeviceState = {
  official?: OfficialSnapshot;
  version: number; snapshots: Record<string, SourceResult & { initialized: boolean; lastSuccessAt: string | null }>;
  seen: Record<string, { date: string; firstSeenAt: string }>; unreadIds: string[]; lastSyncAt: string | null;
};
export function emptyState(): DeviceState;
export function parseState(raw: string | null): DeviceState;
export function applyResults(previous: DeviceState, results: SourceResult[], config: Config, now?: string): DeviceState;
export function mergeEvents(events: TicketEvent[]): TicketEvent[];
export function feedFromState(state: DeviceState, config: Config, now?: string): Feed;
export function markAllRead(state: DeviceState): DeviceState;
