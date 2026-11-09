import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {load} from 'cheerio/slim';
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

test('TIGET 521892: 出演者欄にないゆるめるモ！を詳細本文から取得し、料金形式も読む', () => {
  const [event] = parse('tiget', 'tiget-description', 'https://tiget.net/events/521892');
  assert.ok(event);
  assert.equal(event.artists.find(artist => artist.id === 'group')?.name, 'ゆるめるモ！');
  assert.equal(event.date, '2026-11-03');
  assert.equal(event.doorsAt, '2026-11-03T08:30:00.000Z');
  assert.equal(event.startAt, '2026-11-03T09:00:00.000Z');
  assert.equal(event.offers[0].price, 3500);
  assert.equal(event.offers[0].label, '前売りチケット(一般)');
  assert.match(event.offers[0].note, /1ドリンク別/);
});

const withTigetDescription = description => fixture('tiget-description').replace(/<div class="pg-event__detail__description">[\s\S]*?<\/div>/, `<div class="pg-event__detail__description">${description}</div>`);
test('TIGET: 本文の単なる言及・出演キャンセル・公演外のおすすめを出演と誤認しない', () => {
  for (const description of [
    '<p>ゆるめるモ！のファンの方にもおすすめです。</p>',
    '<p>過去の出演者：ゆるめるモ！</p>',
    '<p>出演：ゆるめるモ！（出演キャンセル） / 別グループ</p>',
    '<p>出演者は別グループです。</p>',
    '<p>出演：<del>ゆるめるモ！</del> / 別グループ</p>',
  ]) {
    const html = withTigetDescription(description) + '<aside><p>ゆるめるモ！</p></aside>';
    assert.deepEqual(extractSiteEvents(html, 'https://tiget.net/events/521892', source('tiget'), config), []);
  }
});

test('TIGET: 本文のユニット・所属明記の個人出演も絞り込み対象として保持', () => {
  for (const [description, name] of [
    ['<p>出演：なにぬねるん？ / 別グループ</p>', 'なにぬねるん？'],
    ['<p>出演者</p><p>19:00〜19:25 ねるん（ゆるめるモ！）</p>', 'ねるん'],
  ]) {
    const [event] = extractSiteEvents(withTigetDescription(description), 'https://tiget.net/events/521892', source('tiget'), config);
    assert.ok(event?.artists.some(artist => artist.name === name), name);
  }
  assert.deepEqual(extractSiteEvents(withTigetDescription('<p>出演：ねるん</p>'), 'https://tiget.net/events/521892', source('tiget'), config), []);
});

test('TIGET: 料金未定の場合に注記のドリンク代をチケット代と誤認しない', () => {
  const html = fixture('tiget-description').replace('料金3,500 円', '料金未定').replace('※1ドリンク別', '※1ドリンク700円別');
  const [event] = extractSiteEvents(html, 'https://tiget.net/events/521892', source('tiget'), config);
  assert.equal(event.offers[0].price, null);
  assert.match(event.offers[0].note, /700円/);
});

test('TIGET: 検索結果から発見し、本文にだけ出演のある公演を収集できる', async () => {
  const tiget = { ...source('tiget'), listingUrls: [source('tiget').listingUrls[0]] };
  const results = await collectTickets({ ...config, sources: [tiget] }, { fetchPage: async url => ({ url, html: new URL(url).pathname === '/events/521892' ? fixture('tiget-description') : '<div class="events-archive-body"><a href="/events/521892">武蔵野音楽祭</a></div>' }) });
  assert.equal(results[0].status, 'ok');
  assert.equal(results[0].events.length, 1);
  assert.equal(results[0].events[0].offers[0].price, 3500);
});

const detailedSources=[
 {id:'ticketdive',file:'ticketdive',url:'https://ticketdive.com/event/youllhalloween'},
 {id:'livepocket',file:'livepocket-event',url:'https://livepocket.jp/e/azi9-'},
 {id:'eplus',file:'eplus',url:'https://eplus.jp/sf/detail/4586830001-P0030001P021001'},
 {id:'tiget',file:'tiget-description',url:'https://tiget.net/events/521892'},
];
function detailedPage(item,body) {
 const $=load(fixture(item.file));
 $('script[type="application/ld+json"]').each((_,node)=>{
  const event=JSON.parse($(node).text());event.name='対バンイベント';event.performer={name:'別グループ'};delete event.description;$(node).text(JSON.stringify(event));
 });
 if(item.id==='ticketdive') {
  $('[class*="EventInfoUnit_name__"]').first().text('対バンイベント');
  $('[class*="EventInfoUnit_detailContainer__"] span').each((_,node)=>{if($(node).text()==='出演')$(node).next('span').text('別グループ');});
  $('[class*="EventDetailUnit_detail__"]').first().html(body);
 } else if(item.id==='livepocket') {
  $('.event-detail h1').first().text('対バンイベント');
  $('.event-detail-info dt').each((_,node)=>{if($(node).text().trim()==='出演者')$(node).next('dd').text('別グループ');});
  $('.event-detail').append(`<div class="event-detail-toggle__text">${body}</div>`);
 } else if(item.id==='eplus') {
  $('.ticket-detail__content dt').each((_,node)=>{if($(node).text().trim()==='出演')$(node).next('dd').text('別グループ');});
  $('.ticket-detail__content').first().append(body);
 } else {
  $('.pg-event__header__title').text('対バンイベント');
  $('dt').each((_,node)=>{if($(node).text().trim()==='出演者')$(node).next('dd').text('別グループ');});
  $('.pg-event__detail__description').html(body);
 }
 $.root().append('<aside class="recommend"><p>ゆるめるモ！</p></aside>');
 return $.html();
}
test('4サイトとも出演者欄にないグループ・ユニット・所属明記の個人を本文から取得',()=>{
 for(const item of detailedSources) for(const [body,name] of [
  ['<p>別グループ<br>ゆるめるモ！</p>','ゆるめるモ！'],
  ['<h3>出演者</h3><ul><li>別グループ</li><li>ゆるめるモ！</li></ul>','ゆるめるモ！'],
  ['<p>【出演】なにQ / 別グループ</p>','なにQ'],
  ['<p>出演：めあり（ゆるめるモ！） / 別グループ</p>','めあり'],
 ]) {
  const events=extractSiteEvents(detailedPage(item,body),item.url,source(item.id),config);
  assert.ok(events.some(event=>event.artists.some(artist=>artist.name===name)),`${item.id}: ${name}`);
 }
});
test('4サイトとも紹介文・過去出演・出演取消・おすすめ・所属なし個人を誤認しない',()=>{
 for(const item of detailedSources) for(const body of [
  '<p>ゆるめるモ！のファンの方におすすめ。</p>',
  '<h3>過去の出演者</h3><p>ゆるめるモ！</p>',
  '<h3>おすすめイベント</h3><p>ゆるめるモ！</p>',
  '<p>出演：ゆるめるモ！（出演キャンセル） / 別グループ</p>',
  '<p>出演：<del>ゆるめるモ！</del> / 別グループ</p>',
  '<p>出演：別グループ</p><aside class="recommend"><p>ゆるめるモ！</p></aside>',
  '<p>出演：ねるん</p>',
 ]) assert.deepEqual(extractSiteEvents(detailedPage(item,body),item.url,source(item.id),config),[],`${item.id}: ${body}`);
});
test('イープラスの構造化データ内の説明も出演者一覧に限定して判定',()=>{
 const item=detailedSources.find(item=>item.id==='eplus');
 for(const [description,expected] of [['<h3>出演者</h3><p>ゆるめるモ！</p>',1],['ゆるめるモ！のファンの方もどうぞ',0],['<p>過去の出演者</p><p>ゆるめるモ！</p>',0]]) {
  const $=load(detailedPage(item,'<p>公演の詳細</p>'));const node=$('script[type="application/ld+json"]').first();const event=JSON.parse(node.text());event.description=description;node.text(JSON.stringify(event));
  assert.equal(extractSiteEvents($.html(),item.url,source(item.id),config).length,expected);
 }
});
test('検索が詳細本文を索引に含めない場合も、公式告知の購入先から本文を確認する',async()=>{
 for(const item of detailedSources) {
  const s={...source(item.id),listingUrls:[],eventUrls:[]};const calls=[];
  const results=await collectTickets({...config,sources:[s]},{today:'2026-11-03',announcementsPromise:Promise.resolve([{title:'ゆるめるモ！出演公演',date:'2026-11-03',ticketUrls:[item.url.replace('https://','')]}]),fetchPage:async url=>{calls.push(url);return{url,html:detailedPage(item,'<p>出演：ゆるめるモ！ / 別グループ</p>')};}});
  assert.equal(results[0].status,'ok');assert.equal(results[0].events.length,1,item.id);assert.deepEqual(calls,[item.url]);
 }
});
