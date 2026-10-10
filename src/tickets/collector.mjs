import { load } from 'cheerio/slim';
import { checkedUrl, discoverEventUrls, normalize } from './extract.mjs';
import { extractSiteEvents } from './adapters.mjs';

// Read-only requests, executed only while the user opens or refreshes the app.
// No cookies, account login, background task, proxy service or API server.
export async function fetchHtml(url, source, { signal, fetcher = fetch, timeoutMs = 15000 } = {}) {
  const target = checkedUrl(url, source.allowedHosts);
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort);
  const timer = setTimeout(abort, timeoutMs);
  try {
    const response = await fetcher(target, {
      signal: controller.signal, credentials: 'omit', headers: { Accept: 'text/html' },
    });
    if (!response.ok) throw new Error(`取得先の応答: HTTP ${response.status}`);
    const finalUrl = checkedUrl(response.url || target, source.allowedHosts);
    if (!response.headers.get('content-type')?.includes('text/html')) throw new Error('HTML 以外の応答です');
    const length = Number(response.headers.get('content-length'));
    if (length > 2_000_000) throw new Error('ページが取得サイズ制限を超えています');
    // React Native の fetch は ReadableStream を持たないため text() を使用。
    const html = await response.text();
    if (html.length > 2_000_000) throw new Error('ページが取得サイズ制限を超えています');
    return { html, url: finalUrl };
  } catch (error) {
    if (controller.signal.aborted) throw new Error(signal?.aborted ? '取得を中断しました' : '通信が時間切れになりました');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export async function collectSource(source, config, fetchPage, signal) {
  const errors = [];
  const urls = new Set(source.eventUrls ?? []);
  const queue = [...(source.listingUrls ?? [])];
  const visited = new Set();
  let successfulListings = 0;
  const ensureActive = () => { if (signal?.aborted) throw new Error('取得を中断しました'); };
  while (queue.length && visited.size < 5) {
    ensureActive();
    const listing = queue.shift();
    if (visited.has(listing)) continue;
    visited.add(listing);
    try {
      const page = await fetchPage(listing, source);
      const $ = load(page.html);
      $('script,style,noscript').remove();
      if (source.listingReadySelector && !$(source.listingReadySelector).length) throw new Error('一覧ページの形式が変わったか、アクセス確認画面が返されています');
      const discovered = discoverEventUrls(page.html, page.url, source);
      if (source.listingReadySelector && !discovered.length && !(source.emptyPattern && new RegExp(source.emptyPattern).test(normalize($.root().text())))) throw new Error('公演リンクも該当なし表示も確認できません');
      successfulListings++;
      for (const url of discovered) urls.add(url);
      $(source.paginationSelector || 'a[rel="next"]').each((_, el) => {
        try {
          const next = checkedUrl(new URL($(el).attr('href'), page.url).href, source.allowedHosts);
          const previous = new URL(page.url);
          const candidate = new URL(next);
          if (candidate.pathname !== previous.pathname || [...previous.searchParams].some(([key, value]) => key !== 'page' && candidate.searchParams.get(key) !== value)) return;
          if (!visited.has(next) && !queue.includes(next)) queue.push(next);
        } catch { /* 許可された同じ検索のページ送りだけを辿る */ }
      });
    } catch (error) { errors.push(error.message); }
  }
  if (queue.some(url => !visited.has(url))) errors.push('一覧が 5 ページを超えています');
  if (urls.size > 50) errors.push('公演候補が 50 件を超えています');
  const events = [];
  for (const url of [...urls].slice(0, 50)) {
    ensureActive();
    try {
      const page = await fetchPage(url, source);
      events.push(...extractSiteEvents(page.html, page.url, source, config));
    } catch (error) { errors.push(error.message); }
  }
  ensureActive();
  return {
    sourceId: source.id, events, name: source.name, checkedAt: new Date().toISOString(),
    found: events.length, status: errors.length ? 'error' : urls.size || successfulListings ? 'ok' : 'unconfigured',
    errors: [...new Set(errors)],
  };
}

export async function collectTickets(config, { signal, fetchPage, onSource } = {}) {
  const fetcher = fetchPage ?? ((url, source) => fetchHtml(url, source, { signal }));
  // Independent sites run in parallel; requests within each site stay sequential.
  return Promise.all(config.sources.map(async source => {
    const result = await collectSource(source, config, fetcher, signal);
    onSource?.(result);
    return result;
  }));
}
