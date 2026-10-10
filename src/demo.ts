import { Feed, TicketEvent } from './types';

// 架空の UI サンプル。実公演、実在する購入ページ、実際の発売情報ではありません。
const sampleDetectedAt = new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z';
const date = (days: number) => {
  const today = new Date();
  today.setUTCDate(today.getUTCDate() + days);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(today);
};
const sample = (id: string, days: number, title: string, venue: string, price: number, sites: string[], fresh = false): TicketEvent => {
  const day = date(days);
  return {
    id, title: `${title}［サンプル］`, date: day, startAt: `${day}T18:30:00+09:00`, doorsAt: `${day}T18:00:00+09:00`,
    venue, address: '架空の会場・公演です',
    offers: sites.map(sourceName => ({ sourceId: sourceName, sourceName, label: '前売り', price, currency: 'JPY', url: null, availability: null })),
    sourceUrls: [], firstSeenAt: sampleDetectedAt, updatedAt: new Date().toISOString(), isBaseline: !fresh,
  };
};
export const demoFeed: Feed = {
  lastSyncAt: null, sources: [],
  events: [
    sample('sample-1', 7, 'ゆるめるモ！ 秋のワンマンライブ', '東京・サンプルホール', 4500, ['TicketDive', 'LivePocket'], true),
    sample('sample-2', 15, 'ゆるめるモ！ × FRIENDS', '大阪・サンプルステージ', 3500, ['TIGET'], true),
    sample('sample-3', 23, 'ゆるめるモ！ 週末フェス', '名古屋・サンプル会場', 6000, ['イープラス', 'ローチケ']),
    sample('sample-4', 31, 'ゆるめるモ！ スペシャルライブ', '東京・サンプルスタジオ', 4000, ['TicketDive']),
  ],
};
