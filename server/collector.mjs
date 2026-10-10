import { readFileSync } from 'node:fs';
import { checkedUrl, discoverEventUrls, extractEvents } from './extract.mjs';
import { ingest } from './store.mjs';

export function readConfig(file) {
  const config = JSON.parse(readFileSync(file, 'utf8'));
  if (!config.artist || !Array.isArray(config.sources)) throw new Error('取得元設定が不正です');
  const ids = new Set();
  for (const source of config.sources) {
    if (!source.id || !source.name || ids.has(source.id) || !Array.isArray(source.allowedHosts) || !source.allowedHosts.length) throw new Error('取得元 ID・名前・許可ホストを確認してください');
    ids.add(source.id);
    if (source.listingUrls?.length && !source.eventPathPattern) throw new Error('一覧ページには eventPathPattern が必要です');
    if (source.eventPathPattern) new RegExp(source.eventPathPattern);
    for (const url of [...(source.listingUrls ?? []), ...(source.eventUrls ?? [])]) checkedUrl(url, source.allowedHosts);
  }
  return config;
}

export async function fetchHtml(url, source) {
  let current = checkedUrl(url, source.allowedHosts);
  for (let redirects = 0; redirects < 4; redirects++) {
    const response = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'YuruTicket/0.1 (+ticket-information-reader)', Accept: 'text/html' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location) throw new Error('リダイレクト先がありません');
      current = checkedUrl(new URL(location, current).href, source.allowedHosts);
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`取得先の応答: HTTP ${response.status}`); }
    if (!response.headers.get('content-type')?.includes('text/html')) { await response.body?.cancel(); throw new Error('HTML 以外の応答です'); }
    const reader = response.body.getReader();
    const parts = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) { await reader.cancel(); throw new Error('ページが取得サイズ制限を超えています'); }
      parts.push(value);
    }
    return { html: Buffer.concat(parts).toString('utf8'), url: current };
  }
  throw new Error('リダイレクト回数制限を超えています');
}

export async function collect(store, config, fetchPage = fetchHtml) {
  const now = new Date().toISOString();
  for (const source of config.sources) {
    const errors = [];
    const urls = new Set(source.eventUrls ?? []);
    for (const listing of source.listingUrls ?? []) {
      try {
        const page = await fetchPage(listing, source);
        for (const url of discoverEventUrls(page.html, page.url, source)) urls.add(url);
      } catch (error) { errors.push(error.message); }
    }
    // 1 サイクルで無制限に巡回しない。上限超過は可視化し、初回同期は確定しない。
    if (urls.size > 50) errors.push('候補が 50 件を超えています。対象アーティストに絞った一覧 URL を設定してください');
    const events = [];
    for (const url of [...urls].slice(0, 50)) {
      try {
        const page = await fetchPage(url, source);
        events.push(...extractEvents(page.html, page.url, source, config));
      } catch (error) { errors.push(error.message); }
    }
    // 失敗した初回取得を基準にすると次回に既存公演を新着通知してしまうため確定を保留。
    if (urls.size > 0) ingest(store.state, source, events, now, !errors.length);
    store.state.sourceStatus[source.id] = {
      name: source.name, checkedAt: now, found: events.length,
      status: errors.length ? 'error' : urls.size ? 'ok' : 'unconfigured',
      errors: [...new Set(errors)],
    };
    store.save();
  }
  store.state.lastSyncAt = now;
  store.save();
}
