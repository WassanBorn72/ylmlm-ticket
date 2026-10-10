import { readFileSync } from 'node:fs';
import { load } from 'cheerio';
import { checkedUrl, discoverEventUrls, normalize } from './extract.mjs';
import { extractSiteEvents } from './adapters.mjs';
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
    if (source.emptyPattern) new RegExp(source.emptyPattern);
    for (const url of [...(source.listingUrls ?? []), ...(source.eventUrls ?? []), ...(source.probeUrl ? [source.probeUrl] : [])]) checkedUrl(url, source.allowedHosts);
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
    let successfulListings = 0;
    const queue = [...(source.listingUrls ?? [])];
    const visited = new Set();
    if (source.probeUrl) {
      try {
        await fetchPage(source.probeUrl, source);
        errors.push('接続は成功しましたが、検索・公演ページの取得処理は未検証です');
      } catch (error) { errors.push(error.message); }
    }
    while (queue.length && visited.size < 5) {
      const listing = queue.shift();
      if (visited.has(listing)) continue;
      visited.add(listing);
      try {
        const page = await fetchPage(listing, source);
        const $ = load(page.html);
        $('script,style,noscript').remove();
        if (source.listingReadySelector && !$(source.listingReadySelector).length) throw new Error('一覧ページの HTML 形式が変わったか、アクセス確認画面が返されています');
        const discovered = discoverEventUrls(page.html, page.url, source);
        if (source.listingReadySelector && !discovered.length && !(source.emptyPattern && new RegExp(source.emptyPattern).test(normalize($('body').text())))) throw new Error('公演リンクも該当なし表示も確認できません');
        successfulListings++;
        for (const url of discovered) urls.add(url);
        $(source.paginationSelector || 'a[rel="next"]').each((_, el) => {
          try {
            const next = checkedUrl(new URL($(el).attr('href'), page.url).href, source.allowedHosts);
            const previous = new URL(page.url);
            const candidate = new URL(next);
            // 同じ一覧のページ番号だけを辿り、別アーティストや無関係の一覧へ広げない。
            if (candidate.pathname !== previous.pathname || [...previous.searchParams].some(([key, value]) => key !== 'page' && candidate.searchParams.get(key) !== value)) return;
            if (!visited.has(next) && !queue.includes(next)) queue.push(next);
          } catch { /* 許可範囲外のページ送りは無視 */ }
        });
      } catch (error) { errors.push(error.message); }
    }
    if (queue.some(url => !visited.has(url))) errors.push('一覧のページ数が 5 ページを超えています。取得範囲を調整してください');
    // 1 サイクルで無制限に巡回しない。上限超過は可視化し、初回同期は確定しない。
    if (urls.size > 50) errors.push('候補が 50 件を超えています。対象アーティストに絞った一覧 URL を設定してください');
    const events = [];
    for (const url of [...urls].slice(0, 50)) {
      try {
        const page = await fetchPage(url, source);
        events.push(...extractSiteEvents(page.html, page.url, source, config));
      } catch (error) { errors.push(error.message); }
    }
    // 失敗した初回取得を基準にすると次回に既存公演を新着通知してしまうため確定を保留。
    if (urls.size > 0 || successfulListings > 0) ingest(store.state, source, events, now, !errors.length);
    store.state.sourceStatus[source.id] = {
      name: source.name, checkedAt: now, found: events.length,
      status: errors.length ? 'error' : urls.size || successfulListings ? 'ok' : 'unconfigured',
      errors: [...new Set(errors)],
    };
    store.save();
  }
  store.state.lastSyncAt = now;
  store.save();
}
