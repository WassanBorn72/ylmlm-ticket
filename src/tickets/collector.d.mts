import type { TicketEvent } from '../types';
export type Source = {
  id: string; name: string; allowedHosts: string[]; adapter?: string;
  listingUrls?: string[]; eventUrls?: string[]; eventPathPattern?: string;
  listingSelector?: string; listingReadySelector?: string; emptyPattern?: string;
  stripQuery?: boolean; paginationSelector?: string;
};
export type Config = { artist: string; aliases?: string[]; venueAliases?: Record<string, string>; sources: Source[] };
export type ParsedEvent = Omit<TicketEvent, 'firstSeenAt' | 'updatedAt' | 'isBaseline' | 'staleSourceIds'>;
export type SourceResult = {
  sourceId: string; name: string; events: ParsedEvent[]; checkedAt: string;
  found: number; status: string; errors: string[];
};
export type FetchPage = (url: string, source: Source) => Promise<{ html: string; url: string }>;
export function fetchHtml(url: string, source: Source, options?: { signal?: AbortSignal; fetcher?: typeof fetch; timeoutMs?: number }): Promise<{ html: string; url: string }>;
export function collectSource(source: Source, config: Config, fetchPage: FetchPage, signal?: AbortSignal): Promise<SourceResult>;
export function collectTickets(config: Config, options?: { signal?: AbortSignal; fetchPage?: FetchPage; onSource?: (result: SourceResult) => void }): Promise<SourceResult[]>;
