import test from 'node:test';
import assert from 'node:assert/strict';
import { collectTickets, fetchHtml } from '../src/tickets/collector.mjs';

const source = { id: 'a', name: 'A', allowedHosts: ['tickets.example'], eventPathPattern: '^/events/[0-9]+$', listingReadySelector: '.listing', listingSelector: '.listing', listingUrls: ['https://tickets.example/search'], emptyPattern: '0件' };
const config = { artist: 'ゆるめるモ！', sources: [source] };
const html = title => `<script type="application/ld+json">${JSON.stringify({ '@type': 'Event', name: title, startDate: '2030-02-01', location: { name: '会場' } })}</script>`;

test('端末取得はCookieを送らず、HTTPエラー・HTML以外・許可外のリダイレクトを拒否', async () => {
  await assert.rejects(fetchHtml(source.listingUrls[0], source, { fetcher: async (_, options) => {
    assert.equal(options.credentials, 'omit');
    return new Response('', { status: 403 });
  } }), /403/);
  await assert.rejects(fetchHtml(source.listingUrls[0], source, { fetcher: async () => new Response('{}', { headers: { 'content-type': 'application/json' } }) }), /HTML/);
  await assert.rejects(fetchHtml(source.listingUrls[0], source, { fetcher: async () => ({ ok: true, url: 'https://other.example/', headers: new Headers({ 'content-type': 'text/html' }) }) }), /HTTPS/);
});

test('React Native同様にストリームなしでHTMLを読み、本文の読み込みもタイムアウト対象', async () => {
  const parsed = await fetchHtml(source.listingUrls[0], source, { fetcher: async () => ({ ok: true, headers: new Headers({ 'content-type': 'text/html' }), text: async () => '<p>ok</p>' }) });
  assert.equal(parsed.html, '<p>ok</p>');
  await assert.rejects(fetchHtml(source.listingUrls[0], source, { timeoutMs: 10, fetcher: async (_, options) => ({ ok: true, headers: new Headers({ 'content-type': 'text/html' }), text: () => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))) }) }), /時間切れ/);
});

test('取得サイズの上限をContent-Lengthと本文で検証', async () => {
  for (const oversized of [true, false]) await assert.rejects(fetchHtml(source.listingUrls[0], source, { fetcher: async () => ({ ok: true, headers: new Headers({ 'content-type': 'text/html', ...(oversized ? { 'content-length': '2000001' } : {}) }), text: async () => 'a'.repeat(2_000_001) }) }), /サイズ/);
});

test('バックグラウンド移行時の中断は次の公演ページを巡回しない', async () => {
  const controller = new AbortController();
  let requests = 0;
  await assert.rejects(collectTickets(config, { signal: controller.signal, fetchPage: async url => {
    requests++; controller.abort();
    return { url, html: '<main class="listing"><a href="/events/1">公演</a></main>' };
  } }), /中断/);
  assert.equal(requests, 1);
});

test('一部サイトや公演ページが失敗しても成功した公演とエラーを返す', async () => {
  const results = await collectTickets({ ...config, sources: [source, { ...source, id: 'b', name: 'B' }] }, { fetchPage: async (url, current) => {
    if (current.id === 'b' || url.endsWith('/2')) throw new Error('HTTP 403');
    return { url, html: url.endsWith('search') ? '<main class="listing"><a href="/events/1">1</a><a href="/events/2">2</a></main>' : html('ゆるめるモ！公演') };
  } });
  assert.equal(results[0].events.length, 1);
  assert.equal(results[0].status, 'error');
  assert.equal(results[1].events.length, 0);
  assert.equal(results[1].status, 'error');
});

// The official calendar retains past notices whose purchase pages may be 404.
test('終了済み公式告知のリンクは取得せず、当日・今後の公演は確認する',async()=>{
 const s={id:'site',name:'Site',allowedHosts:['tickets.example'],eventPathPattern:'^/event/',listingUrls:['https://tickets.example/search'],listingSelector:'main',listingReadySelector:'main',emptyPattern:'0件'};
 for(const fresh of [false,true]) {
  const calls=[];
  const notices=[{title:'過去公演',date:'2026-11-03',ticketUrls:['tickets.example/event/past']},{title:'当日公演',date:'2026-11-09',ticketUrls:['tickets.example/event/today']},{title:'次回公演',date:'2026-11-10',ticketUrls:['tickets.example/event/future']}];
  const results=await collectTickets({artist:'ゆるめるモ！',sources:[s]}, {today:'2026-11-09',...(fresh?{announcementsPromise:Promise.resolve(notices)}:{announcements:notices}),fetchPage:async url=>{
   calls.push(url);if(url.endsWith('/past'))throw new Error('HTTP 404');
   return {url,html:url.endsWith('/search')?'<main>0件</main>':html('別グループ公演')};
  }});
  assert.equal(results[0].status,'ok');assert.ok(!calls.some(url=>url.endsWith('/past')));
  assert.ok(calls.some(url=>url.endsWith('/today')));assert.ok(calls.some(url=>url.endsWith('/future')));
 }
});
test('今後の公式告知のリンクが失敗した場合は取得エラーを隠さない',async()=>{
 const s={id:'site',name:'Site',allowedHosts:['tickets.example'],eventPathPattern:'^/event/',listingUrls:['https://tickets.example/search'],listingSelector:'main',listingReadySelector:'main',emptyPattern:'0件'};
 const results=await collectTickets({artist:'ゆるめるモ！',sources:[s]},{today:'2026-11-09',announcementsPromise:Promise.resolve([{title:'今後の公演',date:'2026-11-10',ticketUrls:['tickets.example/event/future']}]),fetchPage:async url=>{
  if(url.endsWith('/future'))throw new Error('HTTP 404');return {url,html:url.endsWith('/search')?'<main>0件</main>':html('別グループ公演')};
 }});
 assert.equal(results[0].status,'error');assert.match(results[0].errors.join(' '),/HTTP 404/);
});
