const clean = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
export function parseAvailability(value) {
  const text = clean(value);
  if (/完売|売り?切れ?|SOLD\s*OUT/i.test(text)) return 'SoldOut';
  if (/受付終了|販売終了|申込終了|申込受付終了/.test(text)) return 'Discontinued';
  if (/販売前|受付前|受付開始前|販売開始前/.test(text)) return 'PreOrder';
  if (/販売中|受付中|申込受付中|申し込み受付中/.test(text)) return 'InStock';
  return null;
}
const validInstant = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  const d = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}+09:00`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
};
export function salesDates(offer) {
  return { salesStartAt: validInstant(offer.salesStartAt ?? offer.validFrom ?? offer.availabilityStarts), salesEndAt: validInstant(offer.salesEndAt ?? offer.validThrough ?? offer.availabilityEnds) };
}
// Only explicit, fully dated reception windows. Never infer from event dates or prose.
export function parseSalesPeriod(value) {
  const text = clean(value);
  const match = text.match(/(?:受付期間|販売期間|販売受付期間)\s*[:：]?\s*(\d{4})[年/.-](\d{1,2})[月/.-](\d{1,2})日?\s*(?:\([^)]*\))?\s*(\d{1,2}):(\d{2})\s*[~〜～-]\s*(\d{4})[年/.-](\d{1,2})[月/.-](\d{1,2})日?\s*(?:\([^)]*\))?\s*(\d{1,2}):(\d{2})/);
  if (!match) return {};
  const stamp = offset => `${match[offset]}-${match[offset+1].padStart(2,'0')}-${match[offset+2].padStart(2,'0')}T${match[offset+3].padStart(2,'0')}:${match[offset+4]}:00+09:00`;
  const result = salesDates({validFrom:stamp(1),validThrough:stamp(6)});
  return result.salesStartAt && result.salesEndAt && result.salesStartAt < result.salesEndAt ? result : {};
}
export function offerStatus(offer, now = new Date().toISOString()) {
  const current = new Date(now).getTime();
  const {salesStartAt, salesEndAt} = salesDates(offer);
  if (salesEndAt && current > Date.parse(salesEndAt)) return '受付終了';
  if (salesStartAt && current < Date.parse(salesStartAt)) return '販売前';
  return ({SoldOut:'完売',Discontinued:'受付終了',OutOfStock:'販売停止・在庫なし',PreOrder:'販売前',PreSale:'販売前',InStock:'受付中',LimitedAvailability:'受付中',OnlineOnly:'受付中'})[offer.availability] ?? '購入先で確認';
}
export function eventSalesStatus(event, now) {
  const statuses = [...new Set(event.offers.map(offer => offerStatus(offer, now)))];
  if (statuses.length === 1) return statuses[0];
  return statuses.includes('受付中') ? '受付中の券種あり' : '券種ごとに確認';
}
