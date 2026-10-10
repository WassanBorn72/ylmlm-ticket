import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { checkedUrl, discoverEventUrls, extractEvents, hash } from '../src/tickets/extract.mjs';

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

test('端末で計算する UTF-8 ハッシュは既存 ID と互換', () => {
 for (const value of ['ゆるめるモ！', '🎫🎵', 'abc', '\ud800']) assert.equal(hash(value), createHash('sha256').update(value).digest('hex').slice(0, 24));
});
