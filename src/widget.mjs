export function widgetSnapshot(feed,favoriteIds,favoriteChanges={}) {
  const events=feed.events.map(event=>{
    const value=event.doorsAt||event.startAt;
    const clock=value?new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)):'';
    return {id:event.id,title:event.title,date:event.date,sortTime:value??'',favorite:favoriteIds.includes(event.id)||favoriteIds.includes(favoriteChanges?.[event.id]?.favoriteId),timeLabel:clock?`${event.doorsAt?'OPEN':'START'} ${clock}`:'時間未掲載',venueLabel:event.venue,summary:`${Number(event.date.slice(5,7))}/${Number(event.date.slice(8,10))} ${clock?`${event.doorsAt?'OPEN':'START'} ${clock}`:'時間未掲載'} · ${event.venue}`};
  });
  const updated=feed.lastSyncAt?new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(feed.lastSyncAt)):null;
  return {events,updatedShort:updated?`${feed.sources?.some(source=>source.status==='pending')?'確認中':feed.events.some(event=>event.staleSourceIds?.length)?'前回含む':'取得'} ${updated}`:'アプリを開いて情報を取得',updatedLabel:updated?`${updated}取得${feed.sources?.some(source=>source.status==='pending')?'（確認中）':feed.events.some(event=>event.staleSourceIds?.length)?'（一部前回情報）':''} · アプリで更新`:'アプリを開いて情報を取得'};
}
