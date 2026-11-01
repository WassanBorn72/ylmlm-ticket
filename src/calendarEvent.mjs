export function calendarEvent(event) {
  const allDay = !event.startAt;
  const startDate = allDay ? `${event.date}T00:00:00+09:00` : event.startAt;
  const endDate = new Date(Date.parse(startDate) + (allDay ? 86400000 : 3600000)).toISOString();
  const urls = [...new Set(event.offers.map(offer=>offer.url).filter(Boolean))];
  return {
    title:event.title, startDate, endDate, allDay, timeZone:'Asia/Tokyo',
    location:[event.venue,event.address].filter(Boolean).join(' '),
    notes:[allDay ? '開演時間は未掲載です。日時を購入先で確認してください。' : '終了時間は未掲載のため、仮に開演から1時間で設定しています。保存前に修正してください。',...urls].join('\n'),
    ...(urls[0] ? {url:urls[0]} : {}),
  };
}
