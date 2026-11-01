import { salesDates } from './sales.mjs';
export const REMINDER_KIND = 'ylmlm-sale-v1';
export const REMINDER_LIMIT = 50;

// One reminder per favorite event/start time, even with multiple sites or tickets.
export function saleReminders(events, favoriteIds, favoriteChanges = {}, now = new Date().toISOString()) {
  const current = Date.parse(now);
  const groups = new Map();
  for (const event of events) {
    if (!favoriteIds.includes(event.id) && !favoriteIds.includes(favoriteChanges?.[event.id]?.favoriteId)) continue;
    for (const offer of event.offers) {
      const {salesStartAt, salesEndAt} = salesDates(offer);
      if (!salesStartAt || Date.parse(salesStartAt) <= current || salesEndAt && Date.parse(salesEndAt) <= Date.parse(salesStartAt)) continue;
      if (['SoldOut','Discontinued','OutOfStock'].includes(offer.availability)) continue;
      const id = `ylmlm-sale:${event.id}:${Date.parse(salesStartAt)}`;
      const stale = event.staleSourceIds?.includes(offer.sourceId) ?? false;
      if (!groups.has(id)) groups.set(id, {id,eventId:event.id,title:`チケット発売開始：${event.title}`,date:salesStartAt,eventDate:event.date,eventTitle:event.title,url:offer.url ?? event.sourceUrls[0] ?? '',labels:[],stale:true});
      const group = groups.get(id);
      group.stale = group.stale && stale;
      if (stale && !group.stale) continue;
      group.labels.push(`${offer.sourceName}：${offer.label}`);
    }
  }
  return [...groups.values()].map(group=>{
    const labels = [...new Set(group.labels)];
    const body = `${labels.slice(0,4).join(' / ')}${labels.length>4 ? ' ほか' : ''}\n発売日時は取得時点の情報です。購入先で最新の販売状況を確認してください。`;
    const {labels:_,...data}=group;
    return {...data,body,signature:JSON.stringify([group.title,body,group.url,group.date])};
  }).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}

export async function reconcileReminders(api, desired, isCurrent = () => true) {
  const managed = request => request.content.data?.kind === REMINDER_KIND;
  const existing = (await api.list()).filter(managed);
  const present = new Map(existing.map(request=>[request.identifier,request]));
  const targets = new Map(desired.filter(item=>!item.stale||present.has(item.id)).slice(0,REMINDER_LIMIT).map(item=>[item.id,item]));
  for (const request of existing) {
    if (!isCurrent()) return [];
    const target = targets.get(request.identifier);
    if (!target || !target.stale && request.content.data?.signature !== target.signature) {
      await api.cancel(request.identifier);present.delete(request.identifier);
    }
  }
  for (const target of targets.values()) {
    if (!isCurrent()) return [];
    if (target.stale || present.has(target.id) || Date.parse(target.date)<=Date.now()) continue;
    await api.schedule(target);
  }
  return (await api.list()).filter(managed).map(request=>request.identifier);
}
