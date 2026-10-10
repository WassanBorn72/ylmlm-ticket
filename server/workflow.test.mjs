import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkedUrl, discoverEventUrls, extractEvents } from './extract.mjs';
import { Store, ingest } from './store.mjs';
import { collect } from './collector.mjs';
import { createApi } from './index.mjs';
import { deliver } from './notifications.mjs';

const config = { artist: 'ゆるめるモ！', aliases: ['ゆるめるモ!', "You'll Melt More!"] };
const source = { id: 'tiget', name: 'TIGET', allowedHosts: ['tiget.net'], eventPathPattern: '^/events/[0-9]+$' };
const url = 'https://tiget.net/events/123';
const eventData = (overrides = {}) => ({
  '@type': 'MusicEvent', name: 'ゆるめるモ！テスト公演', startDate: '2030-11-03T18:30:00+09:00', doorTime: '18:00',
  location: { name: 'テスト会場', address: { addressRegion: '東京都', addressLocality: '新宿区' } },
  offers: { '@type': 'Offer', name: '前売り', price: '3500', priceCurrency: 'JPY', url },
  ...overrides,
});
const html = data => `<html><script type="application/ld+json">${JSON.stringify({ '@graph': [data] })}</script></html>`;
const extracted = (data = eventData(), currentSource = source) => extractEvents(html(data), url, currentSource, config);
const setup = t => {
  const directory = mkdtempSync(join(tmpdir(), 'yuru-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return new Store(directory);
};

test('JSON-LD から日時、会場、料金、購入先を取得し、JST の開場時刻を解釈する', () => {
  const [event] = extracted();
  assert.equal(event.date, '2030-11-03');
  assert.equal(event.startAt, '2030-11-03T09:30:00.000Z');
  assert.equal(event.doorsAt, '2030-11-03T09:00:00.000Z');
  assert.equal(event.venue, 'テスト会場');
  assert.equal(event.address, '東京都 新宿区');
  assert.equal(event.offers[0].price, 3500);
  assert.equal(event.offers[0].url, url);
});

test('出演者表記の揺れを扱い、対象アーティスト以外の公演を除外する', () => {
  assert.equal(extracted(eventData({ name: '対バン公演', performer: [{ name: 'ゆるめるモ!' }] })).length, 1);
  assert.equal(extracted(eventData({ name: '対バン公演', performer: { name: "You'll Melt More!" } })).length, 1);
  assert.equal(extracted(eventData({ name: '別のアーティスト' })).length, 0);
});

test('未掲載の価格や時間を捏造せず、無料料金は保持する', () => {
  const [unknown] = extracted(eventData({ offers: {}, startDate: '2030-11-03', doorTime: undefined }));
  assert.equal(unknown.offers[0].price, null);
  assert.equal(unknown.startAt, null);
  assert.equal(unknown.doorsAt, null);
  assert.equal(extracted(eventData({ offers: { price: 0, priceCurrency: 'JPY' } }))[0].offers[0].price, 0);
  assert.equal(extracted(eventData({ offers: { price: '未定' } }))[0].offers[0].price, null);
});

test('同一公演の表記揺れは重複を抑え、同日同会場の昼夜公演を区別する', () => {
  const first = extracted()[0];
  const same = extracted(eventData({ name: 'ゆるめるモ! テスト公演' }))[0];
  const matinee = extracted(eventData({ startDate: '2030-11-03T12:30:00+09:00' }))[0];
  assert.equal(first.id, same.id);
  assert.notEqual(first.id, matinee.id);
});

test('不正な日時と未対応 HTML を明示的に失敗とする', () => {
  assert.throws(() => extracted(eventData({ startDate: '不明' })), /開催日/);
  assert.throws(() => extracted(eventData({ startDate: '2030-02-31' })), /開催日/);
  assert.throws(() => extractEvents('<p>公演情報</p>', url, source, config), /アダプター/);
});

test('一覧から許可ホストの公演リンクだけを抽出する', () => {
  const listing = '<a href="/events/123">A</a><a href="/events/123#top">B</a><a href="https://example.com/events/456">外部</a><a href="/about">情報</a>';
  assert.deepEqual(discoverEventUrls(listing, 'https://tiget.net/', source), [url]);
  for (const bad of ['http://tiget.net/events/123', 'https://tiget.net.attacker.com/', 'https://user:pass@tiget.net/', 'https://tiget.net:8443/']) assert.throws(() => checkedUrl(bad, source.allowedHosts));
  assert.equal(extracted(eventData({ offers: { url: 'javascript:alert(1)' } }))[0].offers[0].url, url);
});

test('初回は通知せず、次回の追加だけを通知し、複数サイトの購入先を統合する', t => {
  const store = setup(t);
  store.state.subscriptions.device = { token: 'ExpoPushToken[unit_test_token]' };
  const [first] = extracted();
  assert.equal(ingest(store.state, source, [first]).length, 0);
  assert.equal(store.state.outbox.length, 0);
  const [second] = extracted(eventData({ name: 'ゆるめるモ！追加テスト公演', startDate: '2030-12-03T18:30:00+09:00' }));
  assert.equal(ingest(store.state, source, [first, second]).length, 1);
  assert.equal(store.state.outbox.length, 1);
  ingest(store.state, source, [second]);
  assert.equal(store.state.outbox.length, 1);
  const another = { id: 'livepocket', name: 'LivePocket' };
  const [duplicate] = extracted(eventData({ name: 'ゆるめるモ！追加テスト公演', startDate: '2030-12-03T18:30:00+09:00' }), another);
  ingest(store.state, another, [duplicate]);
  assert.equal(Object.keys(store.state.events).length, 2);
  assert.equal(store.state.events[second.id].offers.length, 2);
  assert.equal(store.state.outbox.length, 1);
  store.save();
  assert.equal(new Store(join(store.file, '..')).state.outbox.length, 1);
});

test('部分的な初回取得は成功分を保存し、既存公演の誤通知を防ぐ', async t => {
  const store = setup(t);
  store.state.subscriptions.device = { token: 'ExpoPushToken[unit_test_token]' };
  const configured = { ...source, eventUrls: [url, 'https://tiget.net/events/456'] };
  await collect(store, { ...config, sources: [configured] }, async current => {
    if (current.endsWith('456')) throw new Error('HTTP 403');
    return { html: html(eventData()), url: current };
  });
  assert.equal(store.state.sourceStatus.tiget.status, 'error');
  assert.equal(Object.keys(store.state.events).length, 1);
  assert.equal(store.state.initializedSources.length, 0);
  await collect(store, { ...config, sources: [configured] }, async current => ({ html: html(eventData({ name: current.endsWith('456') ? 'ゆるめるモ！もう一つの既存公演' : 'ゆるめるモ！テスト公演' })), url: current }));
  assert.equal(store.state.sourceStatus.tiget.status, 'ok');
  assert.equal(store.state.initializedSources.length, 1);
  assert.equal(store.state.outbox.length, 0);
});

test('設定されていない取得元を成功と表示しない', async t => {
  const store = setup(t);
  await collect(store, { ...config, sources: [{ ...source, eventUrls: [], listingUrls: [] }] });
  assert.equal(store.state.sourceStatus.tiget.status, 'unconfigured');
  assert.equal(store.state.initializedSources.length, 0);
});

test('HTTP API で公演一覧、登録、解除を通して確認する', async t => {
  const store = setup(t);
  ingest(store.state, source, extracted());
  const server = createApi(store, { ...config, sources: [source] }, { now: () => new Date('2030-01-01T00:00:00Z') });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const feed = await (await fetch(`${base}/api/events`)).json();
  assert.equal(feed.events[0].venue, 'テスト会場');
  assert.equal(feed.events[0].offers[0].price, 3500);
  const post = token => fetch(`${base}/api/subscriptions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
  assert.equal((await post('invalid')).status, 400);
  const registration = await post('ExpoPushToken[unit_test_token]');
  assert.equal(registration.status, 201);
  const { id } = await registration.json();
  assert.equal((await post('ExpoPushToken[unit_test_token]')).status, 409);
  const [next] = extracted(eventData({ name: 'ゆるめるモ！新着', startDate: '2030-12-01T18:30:00+09:00' }));
  ingest(store.state, source, [next]);
  assert.equal(store.state.outbox.length, 1);
  assert.equal((await fetch(`${base}/api/subscriptions/${id}`, { method: 'DELETE' })).status, 200);
  assert.equal(store.state.subscriptions[id], undefined);
  assert.equal(store.state.outbox[0].dead, true);
  assert.equal((await fetch(`${base}/api/events`, { headers: { Origin: 'https://unknown.example' } })).status, 403);
  assert.equal((await fetch(`${base}/api/events`, { headers: { Origin: 'http://localhost:8081' } })).headers.get('access-control-allow-origin'), 'http://localhost:8081');
});

test('通知は成功時に受付 ID を記録し、失敗時は再送、無効な端末は解除する', async t => {
  const store = setup(t);
  store.state.subscriptions.device = { token: 'ExpoPushToken[unit_test_token]' };
  ingest(store.state, source, []);
  ingest(store.state, source, extracted());
  const now = Date.parse(store.state.outbox[0].nextAttemptAt);
  await deliver(store, async () => new Response('', { status: 503 }), now);
  assert.equal(store.state.outbox[0].attempts, 1);
  assert.equal(store.state.outbox[0].deliveredAt, undefined);
  const retryAt = Date.parse(store.state.outbox[0].nextAttemptAt);
  await deliver(store, async (_url, options) => {
    assert.equal(JSON.parse(options.body).data.eventId, extracted()[0].id);
    return Response.json({ data: { status: 'ok', id: 'test-receipt' } });
  }, retryAt);
  assert.equal(store.state.outbox[0].receiptId, 'test-receipt');
  await deliver(store, async () => Response.json({ data: { 'test-receipt': { status: 'error', details: { error: 'DeviceNotRegistered' } } } }), retryAt + 16 * 60000);
  assert.equal(store.state.subscriptions.device, undefined);
  assert.equal(store.state.outbox[0].receiptStatus, 'error');
});

test('HTTP 200 でも Expo が通知を拒否した場合は成功にしない', async t => {
  const store = setup(t);
  store.state.subscriptions.device = { token: 'ExpoPushToken[unit_test_token]' };
  ingest(store.state, source, []);
  ingest(store.state, source, extracted());
  await deliver(store, async () => Response.json({ data: { status: 'error', details: { error: 'DeviceNotRegistered' } } }), Date.now() + 1000);
  assert.equal(store.state.outbox[0].deliveredAt, undefined);
  assert.equal(store.state.outbox[0].dead, true);
  assert.equal(store.state.subscriptions.device, undefined);
});
