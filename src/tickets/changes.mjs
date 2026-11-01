const price = offer => offer.price === null || offer.price === undefined ? null : offer.currency === 'JPY' || !offer.currency ? `${offer.price.toLocaleString('ja-JP')}円` : `${offer.currency} ${offer.price}`;
const clock = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('ja-JP', {timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)) : null;
const stateLabel = value => ({InStock:'受付中',LimitedAvailability:'受付中',SoldOut:'完売',Discontinued:'受付終了',PreOrder:'販売前',OutOfStock:'販売停止・在庫なし'})[value] ?? value;
const samePage = (a,b) => a.date === b.date && a.title === b.title && a.sourceUrls.some(url => b.sourceUrls.includes(url));
export function updateFavoriteChanges(previous, next, results, favoriteIds, now) {
  const changes = {...previous.favoriteChanges};
  for (const result of results.filter(result => result.status === 'ok')) {
    const oldEvents = previous.snapshots[result.sourceId]?.events ?? [];
    for (const event of result.events) {
      let old = oldEvents.find(old => old.id === event.id);
      if (!old) {
        const matches = oldEvents.filter(old => samePage(old,event));
        if (matches.length === 1 && result.events.filter(item => samePage(item,event)).length === 1) old = matches[0];
      }
      if (!old) continue;
      const pending = changes[old.id] ?? changes[event.id];
      const favoriteId = [pending?.favoriteId, old.id, event.id].find(id => favoriteIds.includes(id));
      if (!favoriteId) continue;
      const fields = [];
      const compare = (key,label,before,after) => {
        if (before !== null && before !== undefined && after !== null && after !== undefined && before !== after) fields.push({key:`${result.sourceId}:${key}`,label:`${result.name} · ${label}`,before:String(before),after:String(after)});
      };
      compare('start','開演時間',clock(old.startAt),clock(event.startAt));
      compare('doors','開場時間',clock(old.doorsAt),clock(event.doorsAt));
      for (const offer of event.offers) {
        const matches = old.offers.filter(item => item.label === offer.label && item.url === offer.url);
        if (matches.length !== 1 || event.offers.filter(item => item.label===offer.label && item.url===offer.url).length!==1) continue;
        const before = matches[0];
        compare(`price:${offer.label}`,`${offer.label}の料金`,price(before),price(offer));
        compare(`status:${offer.label}`,`${offer.label}の販売状況`,stateLabel(before.availability),stateLabel(offer.availability));
        compare(`saleStart:${offer.label}`,`${offer.label}の受付開始`,before.salesStartAt,offer.salesStartAt);
        compare(`saleEnd:${offer.label}`,`${offer.label}の受付終了`,before.salesEndAt,offer.salesEndAt);
      }
      const merged = new Map((pending?.fields ?? []).map(field=>[field.key,field]));
      for (const field of fields) merged.set(field.key,{...field,before:merged.get(field.key)?.before ?? field.before});
      const remaining = [...merged.values()].filter(field=>field.before!==field.after);
      if (pending || fields.length || old.id !== event.id) changes[event.id] = {favoriteId,fields:remaining,detectedAt:fields.length ? now : pending?.detectedAt ?? now};
      if (old.id !== event.id) {
        delete changes[old.id];
        if (previous.seen[old.id]) next.seen[event.id] = {...previous.seen[old.id], date:event.date};
        if (!previous.unreadIds.includes(old.id)) next.unreadIds = next.unreadIds.filter(id=>id!==event.id);
      }
    }
  }
  const active = new Set(Object.values(next.snapshots).flatMap(snapshot=>snapshot.events.map(event=>event.id)));
  next.favoriteChanges = Object.fromEntries(Object.entries(changes).filter(([id,change])=>active.has(id) && (favoriteIds.includes(id)||favoriteIds.includes(change.favoriteId))));
}
