export type Offer = {
  sourceId: string; sourceName: string; label: string;
  price: number | null; currency: string | null; url: string | null; availability: string | null;
  note?: string;
};
export type OfficialDetails = {
  performance: string[]; meetAndGreet: string[]; supplements: string[];
  url: string; checkedAt: string; stale: boolean;
};
export type TicketEvent = {
  id: string; title: string; date: string; startAt: string | null; doorsAt: string | null;
  venue: string; address: string; offers: Offer[]; sourceUrls: string[];
  firstSeenAt: string; updatedAt: string; isBaseline: boolean;
  staleSourceIds?: string[];
  notes?: { sourceId: string; text: string }[];
  officialDetails?: OfficialDetails;
};
export type Feed = {
  events: TicketEvent[]; lastSyncAt: string | null;
  sources: { id: string; name: string; status: string; errors: string[]; checkedAt?: string; found?: number; lastSuccessAt?: string | null }[];
};
