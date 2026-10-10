export async function deliver(store, send = fetch, now = Date.now()) {
  for (const item of store.state.outbox) {
    if (item.deliveredAt || item.dead || Date.parse(item.nextAttemptAt) > now) continue;
    const subscription = store.state.subscriptions[item.subscriptionId];
    const event = store.state.events[item.eventId];
    if (!subscription || subscription.token !== item.token || !event) { item.dead = true; continue; }
    try {
      const response = await send('https://exp.host/--/api/v2/push/send', {
        method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ to: item.token, title: 'ゆるめるモ！の新着チケット', body: `${event.date} ${event.title} / ${event.venue}`, sound: 'default', channelId: 'tickets', data: { eventId: event.id } }),
      });
      if (!response.ok) throw new Error(`Push HTTP ${response.status}`);
      const result = await response.json();
      const ticket = Array.isArray(result.data) ? result.data[0] : result.data;
      if (ticket?.status !== 'ok' || !ticket.id) {
        if (ticket?.details?.error === 'DeviceNotRegistered') {
          delete store.state.subscriptions[item.subscriptionId];
          item.dead = true;
        }
        throw new Error(ticket?.details?.error || 'Push API の受付に失敗しました');
      }
      item.receiptId = ticket.id;
      item.deliveredAt = new Date(now).toISOString(); // 端末到着ではなく Expo による受付
      delete item.lastError;
    } catch (error) {
      item.attempts++;
      item.lastError = error.message;
      item.nextAttemptAt = new Date(now + Math.min(3600000, 60000 * 2 ** Math.min(item.attempts, 6))).toISOString();
      if (item.attempts >= 10) item.dead = true;
    }
    store.save();
  }
  // Expo の受付だけで端末への配信成功と判断せず、15 分後に配信レシートを確認。
  const waiting = store.state.outbox.filter(item => item.receiptId && !item.receiptCheckedAt && now - Date.parse(item.deliveredAt) >= 15 * 60000).slice(0, 1000);
  if (waiting.length) {
    try {
      const response = await send('https://exp.host/--/api/v2/push/getReceipts', {
        method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: waiting.map(item => item.receiptId) }),
      });
      if (!response.ok) throw new Error(`Receipt HTTP ${response.status}`);
      const result = await response.json();
      for (const item of waiting) {
        const receipt = result.data?.[item.receiptId];
        if (!receipt) continue;
        item.receiptCheckedAt = new Date(now).toISOString();
        item.receiptStatus = receipt.status;
        if (receipt.status === 'error') {
          item.lastError = receipt.details?.error || receipt.message || '配信失敗';
          if (receipt.details?.error === 'DeviceNotRegistered') delete store.state.subscriptions[item.subscriptionId];
        }
      }
      store.save();
    } catch (error) { console.error('通知レシート確認失敗:', error.message); }
  }
  store.save();
}
