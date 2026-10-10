import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractSiteEvents } from './adapters.mjs';
import { discoverEventUrls } from './extract.mjs';
import { collect, readConfig } from './collector.mjs';
import { Store, ingest } from './store.mjs';

const config = readConfig(new URL('./sources.json', import.meta.url));
const source = id => config.sources.find(item => item.id === id);
const fixture = id => readFileSync(new URL(`./fixtures/${id}.html`, import.meta.url), 'utf8');
const parse = (id, file, url) => extractSiteEvents(fixture(file), url, source(id), config);
const storeFor = t => {
  const dir = mkdtempSync(join(tmpdir(), 'yuru-adapters-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return new Store(dir);
};

test('TIGET の本文から 15:20 の開演と前売／当日・女性等の全券種を取得', () => {
  const [event] = parse('tiget', 'tiget', 'https://tiget.net/events/527822');
  assert.equal(event.title, '「絶対少女物語vol.3」');
  assert.equal(event.startAt, '2026-10-20T06:20:00.000Z');
  assert.equal(event.doorsAt, '2026-10-20T06:00:00.000Z');
  assert.equal(event.offers.length, 8);
  assert.equal(event.offers.find(offer => offer.label === '女性チケット / 前売券').price, 500);
  assert.equal(event.offers.find(offer => offer.label === '一般チケット / 前売券').price, 1500);
  assert.ok(event.offers[0].note.includes('1ドリンク700円'));
});

test('TicketDive の概要・詳細での時間差を保持し、具体的な会場と全券種を取得', () => {
  const [event] = parse('ticketdive', 'ticketdive', 'https://ticketdive.com/event/youllhalloween');
  assert.equal(event.venue, '新宿Nine Spice');
  assert.equal(event.startAt, '2026-10-27T10:30:00.000Z');
  assert.equal(event.offers.find(offer => offer.label === 'Aチケット').price, 3500);
  assert.equal(event.offers.find(offer => offer.label === 'Sチケット').price, 8000);
  assert.match(event.notes[0].text, /概要: 開場 19:00 \/ 開演 19:30/);
  assert.match(event.notes[0].text, /詳細: 開場 19:35 \/ 開演 20:00/);
});

test('LivePocket は JSON-LD の 00:00 ではなく本文の 17:30 を使用', () => {
  const [event] = parse('livepocket', 'livepocket-event', 'https://livepocket.jp/e/azi9-');
  assert.equal(event.startAt, '2026-10-12T08:30:00.000Z');
  assert.equal(event.doorsAt, '2026-10-12T08:00:00.000Z');
  assert.equal(event.venue, '西永福JAM');
  assert.equal(event.offers[0].price, 2500);
  assert.match(event.address, /東京都杉並区/);
});

test('LivePocket の検索結果だけを巡回し、おすすめ公演を巡回しない', () => {
  const urls = discoverEventUrls(fixture('livepocket-listing'), source('livepocket').listingUrls[0], source('livepocket'));
  assert.deepEqual(urls, ['https://livepocket.jp/e/maqvh', 'https://livepocket.jp/e/azi9-', 'https://livepocket.jp/e/wpw2g', 'https://livepocket.jp/e/yoimachi_day1']);
});

test('イープラスは本文の出演者と開場時刻を補い、未取得料金を捏造しない', () => {
  const [event] = parse('eplus', 'eplus', 'https://eplus.jp/sf/detail/4586830001-P0030001P021001');
  assert.equal(event.date, '2026-11-03');
  assert.equal(event.startAt, '2026-11-03T02:00:00.000Z');
  assert.equal(event.doorsAt, '2026-11-03T01:30:00.000Z');
  assert.equal(event.offers[0].price, null);
  assert.match(event.notes[0].text, /料金がありません/);
});

test('検証した会場の表記対応で LivePocket とイープラスの同一公演を統合', t => {
  const store = storeFor(t);
  const [lp] = parse('livepocket', 'livepocket-festival', 'https://livepocket.jp/e/yoimachi_day1');
  const [ep] = parse('eplus', 'eplus', 'https://eplus.jp/sf/detail/4586830001-P0030001P021001');
  assert.equal(lp.id, ep.id);
  ingest(store.state, source('livepocket'), [lp]);
  ingest(store.state, source('eplus'), [ep]);
  assert.equal(Object.keys(store.state.events).length, 1);
  assert.equal(store.state.events[lp.id].venue, lp.venue);
  assert.deepEqual(store.state.events[lp.id].offers.map(offer => offer.sourceName), ['LivePocket', 'イープラス']);
  assert.equal(store.state.events[lp.id].offers[0].price, 4000);
  assert.equal(store.state.events[lp.id].notes.length, 1);
});

test('ローチケの該当なしは成功扱いにし、以後の新規公演を新着として検出', async t => {
  const store = storeFor(t);
  store.state.subscriptions.device = { token: 'ExpoPushToken[unit_test_token]' };
  await collect(store, { ...config, sources: [source('l-tike')] }, async url => ({ url, html: '<main><h1 class="artist_headingName">ゆるめるモ!のチケット</h1><p>現在受け付け中のゆるめるモ!のチケットはございません。</p></main>' }));
  assert.equal(store.state.sourceStatus['l-tike'].status, 'ok');
  assert.equal(store.state.sourceStatus['l-tike'].found, 0);
  assert.ok(store.state.initializedSources.includes('l-tike'));
  const [event] = parse('eplus', 'eplus', 'https://eplus.jp/sf/detail/4586830001-P0030001P021001');
  assert.equal(ingest(store.state, source('l-tike'), [{ ...event, offers: [{ ...event.offers[0], sourceId: 'l-tike', sourceName: 'ローチケ' }] }]).length, 1);
  assert.equal(store.state.outbox.length, 1);
});

test('HTML の形式変更や HTTP 200 のアクセス確認画面を掲載ゼロと誤認しない', async t => {
  const store = storeFor(t);
  for (const html of ['<main>アクセス確認</main>', '<main class="events-archive-body">読み込み中</main>']) {
    await collect(store, { ...config, sources: [source('tiget')] }, async url => ({ url, html }));
    assert.equal(store.state.sourceStatus.tiget.status, 'error');
    assert.ok(!store.state.initializedSources.includes('tiget'));
  }
});

test('Buzzチケは取得対象から除外する', () => {
  assert.ok(!config.sources.some(item => item.id === 'buzz-ticket'));
});

test('同じ検索条件のページ送りを辿り、別検索には広げない', async t => {
  const store = storeFor(t);
  const searched = { id: 'paged', name: 'ページ送り検証', allowedHosts: ['tiget.net'], listingUrls: ['https://tiget.net/events?artist=yuru'], eventPathPattern: '^/events/[0-9]+$' };
  const visits = [];
  await collect(store, { ...config, sources: [searched] }, async url => {
    visits.push(url);
    return { url, html: url.includes('page=2') ? '<p>次のページ</p>' : '<a rel="next" href="?artist=yuru&page=2">次</a><a rel="next" href="?artist=other&page=2">別の検索</a>' };
  });
  assert.deepEqual(visits, ['https://tiget.net/events?artist=yuru', 'https://tiget.net/events?artist=yuru&page=2']);
});
