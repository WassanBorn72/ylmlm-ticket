import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractSiteEvents } from '../src/tickets/adapters.mjs';
import { discoverEventUrls } from '../src/tickets/extract.mjs';
import { collectTickets } from '../src/tickets/collector.mjs';
import { emptyState, applyResults, feedFromState } from '../src/tickets/state.mjs';

const config = JSON.parse(readFileSync(new URL('../src/tickets/sources.json', import.meta.url), 'utf8'));
const source = id => config.sources.find(item => item.id === id);
const fixture = id => readFileSync(new URL(`./fixtures/${id}.html`, import.meta.url), 'utf8');
const parse = (id, file, url) => extractSiteEvents(fixture(file), url, source(id), config);
const now = '2026-10-11T00:00:00Z';
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

test('検証した会場の表記対応で LivePocket とイープラスの同一公演を統合', () => {
  const [lp] = parse('livepocket', 'livepocket-festival', 'https://livepocket.jp/e/yoimachi_day1');
  const [ep] = parse('eplus', 'eplus', 'https://eplus.jp/sf/detail/4586830001-P0030001P021001');
  assert.equal(lp.id, ep.id);
  const result = (id, event) => ({ sourceId: id, name: source(id).name, status: 'ok', errors: [], events: [event], found: 1, checkedAt: now });
  const state = applyResults(emptyState(), [result('livepocket', lp), result('eplus', ep)], config, now);
  const feed = feedFromState(state, config, now);
  assert.equal(feed.events.length, 1);
  assert.equal(feed.events[0].venue, lp.venue);
  assert.deepEqual(feed.events[0].offers.map(offer => offer.sourceName), ['LivePocket', 'イープラス']);
  assert.equal(feed.events[0].offers[0].price, 4000);
  assert.equal(feed.events[0].notes.length, 1);
});

test('該当なしは成功扱いにして新着判定の基準を保存', async () => {
  const emptySource = { ...source('tiget'), emptyPattern: '検索結果:0件' };
  const only = { ...config, sources: [emptySource] };
  const results = await collectTickets(only, { fetchPage: async url => ({ url, html: '<main class="events-archive-body">検索結果:0件</main>' }) });
  assert.equal(results[0].status, 'ok');
  assert.equal(results[0].found, 0);
  const state = applyResults(emptyState(), results, only, now);
  assert.ok(state.snapshots.tiget.initialized);
  const [event] = parse('eplus', 'eplus', 'https://eplus.jp/sf/detail/4586830001-P0030001P021001');
  const updated = applyResults(state, [{ ...results[0], events: [{ ...event, offers: [{ ...event.offers[0], sourceId: 'tiget', sourceName: 'TIGET' }] }] }], only, now);
  assert.deepEqual(updated.unreadIds, [event.id]);
});

test('HTML の形式変更や HTTP 200 のアクセス確認画面を掲載ゼロと誤認しない', async () => {
  for (const html of ['<main>アクセス確認</main>', '<main class="events-archive-body">読み込み中</main>']) {
    const only = { ...config, sources: [source('tiget')] };
    const results = await collectTickets(only, { fetchPage: async url => ({ url, html }) });
    assert.equal(results[0].status, 'error');
    assert.ok(!applyResults(emptyState(), results, only, now).snapshots.tiget.initialized);
  }
});

test('Buzzチケとローチケは取得対象から除外する', () => {
  assert.deepEqual(config.sources.map(item => item.id), ['ticketdive', 'livepocket', 'tiget', 'eplus']);
});

test('同じ検索条件のページ送りを辿り、別検索には広げない', async () => {
  const searched = { id: 'paged', name: 'ページ送り検証', allowedHosts: ['tiget.net'], listingUrls: ['https://tiget.net/events?artist=yuru'], eventPathPattern: '^/events/[0-9]+$' };
  const visits = [];
  await collectTickets({ ...config, sources: [searched] }, { fetchPage: async url => {
    visits.push(url);
    return { url, html: url.includes('page=2') ? '<p>次のページ</p>' : '<a rel="next" href="?artist=yuru&page=2">次</a><a rel="next" href="?artist=other&page=2">別の検索</a>' };
  } });
  assert.deepEqual(visits, ['https://tiget.net/events?artist=yuru', 'https://tiget.net/events?artist=yuru&page=2']);
});
