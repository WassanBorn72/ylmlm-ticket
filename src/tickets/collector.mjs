import { officialArtistHints } from './artists.mjs';
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
  const queryPages = new Map();
  const ensureActive = () => { if (signal?.aborted) throw new Error('取得を中断しました'); };
  const listingWorker = async () => {
  while (queue.length && visited.size < 5 * Math.max(1, (source.listingUrls ?? []).length)) {
    ensureActive();
    const listing = queue.shift();
    if (visited.has(listing)) continue;
    const root = new URL(listing);
    root.searchParams.delete('page'); root.searchParams.sort();
    const query = root.href;
    if ((queryPages.get(query) ?? 0) >= 5) { errors.push('同じ検索の一覧が 5 ページを超えています'); continue; }
    queryPages.set(query, (queryPages.get(query) ?? 0) + 1);
    visited.add(listing);
    try {
      const page = await fetchPage(listing, source);
      const $ = load(page.html);
      $('script,style,noscript').remove();
      if (source.listingReadySelector && !$(source.listingReadySelector).length) throw new Error('一覧ページの形式が変わったか、アクセス確認画面が返されています');
      const discovered = discoverEventUrls(page.html, page.url, source);
      let structuredEmpty = false;
      if (source.adapter === 'ticketdive') {
        try {
          const data = JSON.parse(load(page.html)('#__NEXT_DATA__').text());
          const packed = data.props?.pageProps?.__superjsonProps;
          const payload = (typeof packed === 'string' ? JSON.parse(packed) : packed)?.json;
          structuredEmpty = data.page === '/search' && payload?.searchQuery === new URL(page.url).searchParams.get('q') && Array.isArray(payload.eventList) && payload.eventList.length === 0;
        } catch { /* Unrecognized data is not evidence of an empty listing. */ }
      }
      if (source.listingReadySelector && !discovered.length && !structuredEmpty && !(source.emptyPattern && new RegExp(source.emptyPattern).test(normalize($.root().text())))) throw new Error('公演リンクも該当なし表示も確認できません');
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
  };
  await Promise.all([listingWorker(), listingWorker()]);
  if (queue.some(url => !visited.has(url))) errors.push('検索一覧の取得ページ上限を超えています');
  if (urls.size > 50) errors.push('公演候補が 50 件を超えています');
  const candidates = [...urls].sort().slice(0, 50);
  const chunks = candidates.map(() => []);
  let cursor = 0;
  const eventWorker = async () => {
    while (cursor < candidates.length) {
      ensureActive();
      const index = cursor++;
      try {
        const page = await fetchPage(candidates[index], source);
        chunks[index] = extractSiteEvents(page.html, page.url, source, config);
      } catch (error) { errors.push(error.message); }
    }
  };
  await Promise.all([eventWorker(), eventWorker()]);
  const events = chunks.flat();
  ensureActive();
  return {
    sourceId: source.id, events, name: source.name, checkedAt: new Date().toISOString(),
    found: events.length, status: errors.length ? 'error' : urls.size || successfulListings ? 'ok' : 'unconfigured',
    errors: [...new Set(errors)],
  };
}

// Search may only index a site's performer field. Official calendar purchase
// links are also discovery candidates; they do not override artist verification.
function officialEventUrls(announcements,source) {
  const urls=new Set();
  for(const notice of announcements??[]) for(const raw of notice.ticketUrls??[]) {
    try {
      const target=new URL(checkedUrl(raw.startsWith('https://')?raw:`https://${raw}`,source.allowedHosts));
      if(!source.eventPathPattern||!new RegExp(source.eventPathPattern).test(target.pathname))continue;
      if(source.stripQuery)target.search='';
      urls.add(target.href);
    }catch{/* Ignore links outside the verified ticket-site event paths. */}
  }
  return [...urls];
}

export async function collectTickets(config, { signal, fetchPage, onSource, announcements, announcementsPromise } = {}) {
  const officialHints = announcementsPromise ? [] : officialArtistHints(announcements, config);
  config = { ...config, officialHints };
  const rawFetcher = fetchPage ?? ((url, source) => fetchHtml(url, source, { signal }));
  // A bounded per-refresh page cache lets fresh official hints reparse mixed
  // group/solo pages without another request or keeping every listing in RAM.
  const pages = new Map();
  const fetcher = (url, source) => {
    if (!source.eventPathPattern || !new RegExp(source.eventPathPattern).test(new URL(url).pathname)) return rawFetcher(url, source);
    const key = `${source.id}:${url}`;
    if (pages.has(key)) return pages.get(key);
    const task = rawFetcher(url,source).catch(error=>{pages.delete(key);throw error;});
    pages.set(key,task);
    while (pages.size>16) pages.delete(pages.keys().next().value);
    return task;
  };
  // Sites run independently; each host has at most two in-flight requests.
  const initial = Promise.all(config.sources.map(async source => {
    const eventUrls = [...(source.eventUrls ?? []), ...(announcementsPromise?[]:officialEventUrls(announcements,source)), ...officialHints.filter(hint => source.allowedHosts.includes(new URL(hint.url).hostname)).map(hint => hint.url)];
    const result = await collectSource({ ...source, eventUrls }, config, fetcher, signal);
    onSource?.(announcementsPromise && result.status === 'ok' ? {...result,status:'pending'} : result);
    return result;
  }));
  if (!announcementsPromise) return initial;
  const [results, freshAnnouncements] = await Promise.all([initial, announcementsPromise]);
  if (signal?.aborted) throw new Error('取得を中断しました');
  const freshHints = officialArtistHints(freshAnnouncements, config);
  return Promise.all(results.map(async (result, index) => {
    const source = config.sources[index];
    const missing = [...new Set([...officialEventUrls(freshAnnouncements,source),...freshHints.filter(hint => source.allowedHosts.includes(new URL(hint.url).hostname)).map(hint => hint.url)])];
    const supplement = missing.length ? await collectSource({...source, listingUrls:[], eventUrls:missing}, {...config, officialHints:freshHints}, fetcher, signal) : null;
    const merged = new Map();
    const reparsed = new Set((supplement?.events ?? []).flatMap(event=>event.sourceUrls));
    for (const event of [...result.events.filter(event=>!event.sourceUrls.some(url=>reparsed.has(url))), ...(supplement?.events ?? [])]) {
      const previous = merged.get(event.id);
      const hinted = freshHints.filter(hint => hint.date === event.date && event.sourceUrls.includes(hint.url)).flatMap(hint=>hint.artists);
      const artists = [...new Map([...(previous?.artists ?? []), ...(event.artists ?? []), ...hinted].map(artist=>[artist.id,artist])).values()];
      merged.set(event.id, {...event, artists, offers:[...(previous?.offers ?? []), ...event.offers], sourceUrls:[...new Set([...(previous?.sourceUrls ?? []), ...event.sourceUrls])]});
    }
    const events = [...merged.values()];
    const combined = {...result, events, found:events.length, ...(supplement ? {checkedAt:supplement.checkedAt,status:result.status==='error'||supplement.status==='error'?'error':'ok',errors:[...new Set([...result.errors,...supplement.errors])]} : {})};
    onSource?.(combined);
    return combined;
  }));
}
