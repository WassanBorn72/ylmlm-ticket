export function calendarEvent(event) {
  const allDay = !event.startAt;
  const startDate = allDay ? `${event.date}T00:00:00+09:00` : event.startAt;
  const endDate = new Date(Date.parse(startDate) + (allDay ? 86400000 : 3600000)).toISOString();
  const urls = [...new Set(event.offers.map(offer=>offer.url).filter(Boolean))];
  const details = event.officialDetails;
  const unique = values => [...new Set((values ?? []).map(value => String(value).trim()).filter(Boolean))];
  const officialNotes = [];
  if (details) {
    if (details.stale) officialNotes.push('※公式情報は前回取得の内容です。最新の告知を確認してください。');
    const performance = unique(details.performance);
    const meetAndGreet = unique(details.meetAndGreet);
    const supplements = unique(details.supplements);
    if (performance.length) officialNotes.push(`【出演時間】\n${performance.join('\n')}`);
    if (meetAndGreet.length) officialNotes.push(`【特典会時間】\n${meetAndGreet.join('\n')}`);
    if (supplements.length) officialNotes.push(`【補足】\n${supplements.map(text => `・${text}`).join('\n')}`);
    if (officialNotes.length && Number.isFinite(Date.parse(details.checkedAt))) {
      officialNotes.push(`公式情報の確認日時：${new Date(details.checkedAt).toLocaleString('ja-JP', {timeZone:'Asia/Tokyo'})}（日本時間）`);
    }
  }
  const ticketNotes = unique(event.notes?.map(note => note.text));
  const notes = [
    allDay ? '開演時間は未掲載です。日時を購入先で確認してください。' : '終了時間は未掲載のため、仮に開演から1時間で設定しています。保存前に修正してください。',
    ...officialNotes,
    ...(ticketNotes.length ? [`【チケットサイトの補足】\n${ticketNotes.map(text => `・${text}`).join('\n')}`] : []),
    ...(urls.length ? [`【購入先】\n${urls.join('\n')}`] : []),
  ].join('\n\n');
  return {
    title:event.title, startDate, endDate, allDay, timeZone:'Asia/Tokyo',
    location:[event.venue,event.address].filter(Boolean).join(' '),
    notes,
    ...(urls[0] ? {url:urls[0]} : {}),
  };
}
