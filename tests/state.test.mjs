import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, applyResults, feedFromState, markAllRead, parseState } from '../src/tickets/state.mjs';

const source = { id: 'a', name: 'A' };
const other = { id: 'b', name: 'B' };
const config = { sources: [source, other] };
const now = '2030-01-01T00:00:00Z';
const event = (id = 'one', sourceId = 'a', overrides = {}) => ({
  id, title: id, date: '2030-02-01', startAt: null, doorsAt: null, venue: '会場', address: '',
  offers: [{ sourceId, sourceName: sourceId.toUpperCase(), price: 1500, currency: 'JPY', url: `https://${sourceId}.example/event`, label: '前売' }],
  sourceUrls: [`https://${sourceId}.example/event`], ...overrides,
});
const result = (events = [], overrides = {}) => ({ sourceId: 'a', name: 'A', events, status: 'ok', found: events.length, checkedAt: now, errors: [], ...overrides });

test('初回は新着ゼロ、次回の追加のみ新着、既読は端末保存から復元', () => {
  let state = applyResults(emptyState(), [result([event()])], config, now);
  assert.equal(state.unreadIds.length, 0);
  state = applyResults(state, [result([event(), event('two')])], config, now);
  assert.deepEqual(state.unreadIds, ['two']);
  assert.equal(feedFromState(state, config, now).events.find(item => item.id === 'two').isBaseline, false);
  state = parseState(JSON.stringify(markAllRead(state)));
  state = applyResults(state, [result([event(), event('two')])], config, now);
  assert.equal(state.unreadIds.length, 0);
});

test('成功したサイトで掲載から消えた公演と券種を除去し、他サイトの掲載は保持', () => {
  const state = applyResults(emptyState(), [result([event(), event('removed')]), result([event('one', 'b')], { sourceId: 'b', name: 'B' })], config, now);
  const next = applyResults(state, [result([])], config, now);
  const feed = feedFromState(next, config, now);
  assert.equal(feed.events.length, 1);
  assert.deepEqual(feed.events[0].offers.map(offer => offer.sourceId), ['b']);
});

test('取得失敗は掲載終了と誤認せず前回情報と取得エラーを明示、復旧時は除去', () => {
  const initial = applyResults(emptyState(), [result([event()])], config, now);
  const failed = applyResults(initial, [result([], { status: 'error', errors: ['HTTP 403'] })], config, now);
  const feed = feedFromState(failed, config, now);
  assert.equal(feed.events.length, 1);
  assert.deepEqual(feed.events[0].staleSourceIds, ['a']);
  assert.equal(feed.sources[0].status, 'error');
  assert.equal(feedFromState(applyResults(failed, [result([])], config, now), config, now).events.length, 0);
});

test('部分的な初回取得後の復旧では既存公演を誤って新着にしない', () => {
  const partial = applyResults(emptyState(), [result([event()], { status: 'error', errors: ['timeout'] })], config, now);
  assert.equal(partial.snapshots.a.initialized, false);
  const recovered = applyResults(partial, [result([event(), event('two')])], config, now);
  assert.equal(recovered.unreadIds.length, 0);
  assert.equal(recovered.snapshots.a.initialized, true);
});

test('掲載ゼロを基準に、次回掲載の公演を新着として検出', () => {
  const initial = applyResults(emptyState(), [result([])], config, now);
  const next = applyResults(initial, [result([event()])], config, now);
  assert.deepEqual(next.unreadIds, ['one']);
});

test('初回のサイトと同期済みサイトが同じ新公演を返しても巡回順で新着が変わらない', () => {
  const initial = applyResults(emptyState(), [result([],{ sourceId: 'b' })], config, now);
  const first = result([event()]);
  const second = result([event('one', 'b')], { sourceId: 'b' });
  for (const results of [[first, second], [second, first]]) {
    assert.deepEqual(applyResults(initial, results, config, now).unreadIds, ['one']);
  }
});

test('重複公演・再掲載・価格変更は重複した新着にしない', () => {
  let state = applyResults(emptyState(), [result([event()]), result([],{ sourceId: 'b' })], config, now);
  state = applyResults(state, [result([event('one', 'b')], { sourceId: 'b' })], config, now);
  assert.equal(feedFromState(state, config, now).events.length, 1);
  assert.equal(state.unreadIds.length, 0);
  state = applyResults(state, [result([])], config, now);
  state = applyResults(state, [result([event('one', 'a', { offers: [{ ...event().offers[0], price: 2000 }] })])], config, now);
  assert.equal(state.unreadIds.length, 0);
  assert.equal(feedFromState(state, config, now).events[0].offers[0].price, 2000);
});

test('過去公演はJST基準で非表示、終了後は新着判定用IDも破棄', () => {
  const state = applyResults(emptyState(), [result([event('past', 'a', { date: '2029-12-31' }), event('today', 'a', { date: '2030-01-01' })])], config, now);
  assert.deepEqual(feedFromState(state, config, now).events.map(item => item.id), ['today']);
  assert.equal(feedFromState(state, config, '2030-01-01T15:00:00Z').events.length, 0);
  assert.equal(Object.keys(applyResults(state, [], config, '2030-01-01T15:00:00Z').seen).length, 0);
});

test('壊れた端末保存は読み込みエラーとなり、未取得は空の状態', () => {
  assert.equal(parseState(null).version, 1);
  for (const raw of ['invalid', '{}', JSON.stringify({ version: 1, snapshots: { a: {} }, seen: {}, unreadIds: [] })]) assert.throws(() => parseState(raw));
});
