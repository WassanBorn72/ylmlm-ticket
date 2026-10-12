import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Route actual ticket-site URLs to saved page excerpts. No API, proxy, or live network.
const config = JSON.parse(readFileSync(new URL('../src/tickets/sources.json', import.meta.url), 'utf8'));
const fixture = name => readFileSync(new URL(`../tests/fixtures/${name}.html`, import.meta.url), 'utf8').replaceAll('2026', '2035');
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  headless: true, args: process.env.CI ? ['--no-sandbox'] : [],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
await page.addInitScript(() => {
  window.openedMapUrls = [];
  window.open = url => { window.openedMapUrls.push(String(url)); return null; };
});
page.on('pageerror', error => errors.push(error.message));
let phase = 'initial';
let requests = 0;
let unexpected = [];
const headers = { 'content-type': 'text/html; charset=utf-8', 'access-control-allow-origin': '*' };
for (const source of config.sources) {
  await page.route(`https://${source.allowedHosts[0]}/**`, async route => {
    requests++;
    const url = new URL(route.request().url());
    if (phase === 'offline') return route.abort('internetdisconnected');
    if (phase === 'failed' && source.id === 'tiget') return route.fulfill({ status: 403, headers, body: 'Forbidden' });
    const listing = source.listingUrls.some(value => new URL(value).pathname === url.pathname);
    let html;
    if (listing) {
      if (source.id === 'ticketdive') html = `<main class="SearchPage_container__fixture">${['removed', 'failed'].includes(phase) ? '検索結果は0件' : '<a href="/event/youllhalloween">公演</a>'}</main>`;
      if (source.id === 'livepocket') html = `<div class="event-list"><h1>検索</h1><div class="event-card-list"><a href="/e/yoimachi_day1">公演</a>${phase === 'initial' ? '' : '<a href="/e/azi9-">追加公演</a>'}</div></div>`;
      if (source.id === 'tiget') html = '<main class="events-archive-body"><a href="/events/527822">公演</a></main>';
      if (source.id === 'eplus') html = '<h1 class="page-header__title">ゆるめるモ！</h1><main class="section--ticket-list"><a href="/sf/detail/4586830001-P0030001P021001">公演</a></main>';
    } else {
      html = {
        '/event/youllhalloween': 'ticketdive', '/e/yoimachi_day1': 'livepocket-festival',
        '/e/azi9-': 'livepocket-event', '/events/527822': 'tiget',
        '/sf/detail/4586830001-P0030001P021001': 'eplus',
      }[url.pathname];
      html = html && fixture(html);
    }
    if (!html) { unexpected.push(url.href); return route.abort(); }
    await route.fulfill({ status: 200, headers, body: html });
  });
}
await page.route('https://ylmlm.jp/**', async route => {
  requests++;
  if (phase === 'offline') return route.abort('internetdisconnected');
  await route.fulfill({ status: 200, headers, body: fixture('official-calendar') });
});
const cards = () => page.getByRole('button', { name: /詳細を表示$/ });
const expectCards = async count => {
  await page.waitForFunction(expected => document.querySelectorAll('[role="button"][aria-label$="詳細を表示"]').length === expected, count);
  assert.equal(await cards().count(), count);
};
const waitIdle = async () => {
  await page.getByRole('button', { name: 'チケット情報を更新', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('[aria-label="チケット情報を更新"]')?.getAttribute('aria-disabled') !== 'true');
};
const refresh = async () => {
  await page.getByRole('button', { name: 'チケット情報を更新', exact: true }).click();
  await waitIdle();
};
const chooseDate = async date => {
  await page.getByRole('button', { name: '日付で絞り込む', exact: true }).click();
  await page.getByText('開催日を選ぶ', { exact: true }).waitFor();
  await page.getByRole('button', { name: new RegExp(`^${date}の公演で絞り込む`) }).click();
  await page.getByRole('button', { name: '日付選択を閉じる', exact: true }).waitFor({ state: 'hidden' });
};
try {
  await page.goto(process.env.WEB_TEST_URL || 'http://127.0.0.1:8081');
  await waitIdle();
  await expectCards(3);
  await page.getByText('モ！のチケット帳', { exact: true }).waitFor();
  await page.getByText('（非公式）', { exact: true }).waitFor();
  await cards().filter({ hasText: 'ハロウィン' }).first().click({ position: { x: 10, y: 10 } });
  await page.getByText('公式告知の詳細', { exact: true }).waitFor();
  await page.getByText('出演時間：未掲載', { exact: true }).waitFor();
  await page.getByText('特典会時間：未掲載', { exact: true }).waitFor();
  assert.match(await page.getByText(/ハロウィンの準備する権/).innerText(), /Sチケット.*19:00-19:30/);
  await page.getByText('その他補足', { exact: true }).waitFor();
  assert.equal(await page.getByText('その他補足（公式告知本文）', { exact: true }).count(), 0);
  assert.equal(await page.getByText(/OPEN 19:35\/START 20:00/).count(), 0);
  await page.getByRole('link', { name: '公式告知を確認', exact: true }).click();
  assert.ok((await page.evaluate(() => window.openedMapUrls)).includes('https://ylmlm.jp/#schedule'));
  await page.evaluate(() => { window.openedMapUrls = []; });
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.getByText('公演・チケット詳細', { exact: true }).waitFor({ state: 'hidden' });

  assert.equal(await page.getByText('ゆるチケ', { exact: true }).count(), 0);
  await page.getByRole('link', { name: '新宿Nine Spiceを地図で開く', exact: true }).click();
  let mapUrls = await page.evaluate(() => window.openedMapUrls);
  assert.equal(mapUrls.length, 1);
  assert.equal(new URL(mapUrls[0]).origin, 'https://www.google.com');
  assert.match(new URL(mapUrls[0]).searchParams.get('query'), /新宿Nine Spice/);
  assert.equal(await page.getByText('公演・チケット詳細', { exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(await page.getByText('推しに会える日を、見つけよう。').count(), 0);
  assert.equal(await page.getByText('ライブ情報', { exact: true }).count(), 0);
  for (const source of config.sources) assert.equal(await page.getByRole('button', { name: source.name, exact: true }).count(), 0);
  await page.getByRole('button', { name: '日付で絞り込む', exact: true }).click();
  await page.getByText('2035年10月', { exact: true }).waitFor();
  for (let month = 0; month < 3; month++) await page.getByRole('button', { name: '次の月', exact: true }).click();
  await page.getByText('2036年1月', { exact: true }).waitFor();
  for (let month = 0; month < 3; month++) await page.getByRole('button', { name: '前の月', exact: true }).click();
  await page.getByRole('button', { name: 'カレンダーを閉じる', exact: true }).click();
  await page.getByRole('button', { name: '日付選択を閉じる', exact: true }).waitFor({ state: 'hidden' });
  await expectCards(3);
  await chooseDate('2035-10-20');
  await expectCards(1);
  await page.getByRole('button', { name: '日付の絞り込みを解除', exact: true }).waitFor();
  assert.match(await cards().first().getAttribute('aria-label'), /絶対少女物語/);
  await page.getByLabel('公演名・会場で検索').fill('ハロウィンパーティー');
  await expectCards(0);
  await page.getByText('条件に合う公演がありません', { exact: true }).waitFor();
  await page.getByRole('button', { name: '検索をクリア' }).click();
  await expectCards(1);
  await page.getByRole('button', { name: '日付の絞り込みを解除', exact: true }).click();
  await expectCards(3);
  await chooseDate('2035-10-21');
  await expectCards(0);
  await page.getByText('日付や検索条件を変更してください。', { exact: true }).waitFor();
  await page.getByRole('button', { name: '日付の絞り込みを解除', exact: true }).click();
  await expectCards(3);
  const favorite = page.getByRole('button', { name: /ハロウィンパーティー.*をお気に入りに登録$/ });
  await favorite.click();
  await page.getByRole('button', { name: /ハロウィンパーティー.*をお気に入りから解除$/ }).waitFor();
  assert.equal(await page.getByText('公演・チケット詳細', { exact: true }).count(), 0);
  await page.getByRole('tab', { name: 'お気に入り', exact: true }).click();
  await expectCards(1);
  await page.reload();
  await waitIdle();
  await page.getByRole('tab', { name: 'お気に入り', exact: true }).click();
  await expectCards(1);
  await cards().first().click({ position: { x: 10, y: 10 } });
  await page.getByRole('button', { name: /ハロウィンパーティー.*をお気に入りから解除$/ }).last().click();
  await page.getByRole('button', { name: /ハロウィンパーティー.*をお気に入りに登録$/ }).waitFor();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await expectCards(0);
  await page.getByRole('tab', { name: 'チケット', exact: true }).click();
  await favorite.click();
  await page.getByRole('button', { name: /ハロウィンパーティー.*をお気に入りから解除$/ }).waitFor();
  await page.getByRole('button', { name: '詳細を閉じる', exact: true }).waitFor({ state: 'hidden' });
  if (process.env.SCREENSHOT_PATH) await page.screenshot({ path: process.env.SCREENSHOT_PATH, fullPage: true });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole('button', { name: '日付で絞り込む', exact: true }).click();
  await page.getByText('開催日を選ぶ', { exact: true }).waitFor();
  await page.getByRole('button', { name: '次の月', exact: true }).click();
  await page.getByRole('button', { name: '前の月', exact: true }).click();
  await page.getByText('2035年10月', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  if (process.env.SCREENSHOT_PATH) await page.screenshot({ path: process.env.SCREENSHOT_PATH.replace('.png', '-calendar.png') });
  await page.getByRole('button', { name: 'すべての日付を表示', exact: true }).click();
  await page.getByRole('button', { name: '日付選択を閉じる', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: /^新着/ }).click();
  await expectCards(0);
  // All first-run listings are a baseline, not new events.
  await page.getByRole('tab', { name: 'チケット', exact: true }).click();
  await page.getByLabel('公演名・会場で検索').fill('ハロウィンパーティー');
  await expectCards(1);
  await page.getByText('時間の記載に差があります · 詳細を確認').waitFor();
  await cards().first().click({ position: { x: 10, y: 10 } });
  await page.getByText(/TicketDive: 概要と詳細で時間が異なります/).waitFor();
  const previousMapCount = (await page.evaluate(() => window.openedMapUrls)).length;
  await page.getByRole('link', { name: '新宿Nine Spiceを地図で開く', exact: true }).last().click();
  mapUrls = await page.evaluate(() => window.openedMapUrls);
  assert.equal(mapUrls.length, previousMapCount + 1);
  assert.match(new URL(mapUrls.at(-1)).searchParams.get('query'), /新宿Nine Spice/);
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.getByLabel('公演名・会場で検索').fill('YOIMACHI');
  await cards().first().click({ position: { x: 10, y: 10 } });
  assert.equal(await page.getByRole('link', { name: /LivePocket/ }).count(), 1);
  assert.equal(await page.getByRole('link', { name: /イープラス.*購入先で確認/ }).count(), 1);
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.getByRole('button', { name: '検索をクリア' }).click();
  await chooseDate('2035-10-20');
  await expectCards(1);
  await page.getByRole('button', { name: '日付の絞り込みを解除', exact: true }).click();
  phase = 'addition';
  await refresh();
  await expectCards(4);
  await page.getByRole('link', { name: '西永福JAMを地図で開く', exact: true }).click();
  mapUrls = await page.evaluate(() => window.openedMapUrls);
  assert.match(new URL(mapUrls.at(-1)).searchParams.get('query'), /西永福JAM.*東京都杉並区/);
  await page.getByRole('tab', { name: /^新着/ }).click();
  await expectCards(1);
  await chooseDate('2035-10-12');
  await expectCards(1);
  await page.getByRole('button', { name: 'すべて既読にする', exact: true }).click();
  await expectCards(0);
  await page.reload();
  await waitIdle();
  await page.getByRole('tab', { name: /^新着/ }).click();
  await expectCards(0);
  await page.getByRole('tab', { name: 'チケット', exact: true }).click();
  await chooseDate('2035-10-27');
  await expectCards(1);
  phase = 'removed';
  await refresh();
  await expectCards(0);
  await page.getByText('条件に合う公演がありません', { exact: true }).waitFor();
  await page.getByRole('button', { name: '日付の絞り込みを解除', exact: true }).click();
  await expectCards(3);
  assert.equal(await page.getByText(/時間の記載に差があります/).count(), 0);
  await page.getByRole('tab', { name: 'お気に入り', exact: true }).click();
  await expectCards(0);
  await page.getByRole('tab', { name: 'チケット', exact: true }).click();
  phase = 'failed';
  await refresh();
  await expectCards(3);
  await page.getByText('一部は前回取得の情報です · 取得状況を確認').waitFor();
  await page.getByRole('tab', { name: '設定', exact: true }).click();
  await page.getByText('取得先の応答: HTTP 403', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /通知をオン/ }).count(), 0);
  assert.equal(await page.getByText('Buzzチケ', { exact: true }).count(), 0);
  assert.equal(await page.getByText('ローチケ', { exact: true }).count(), 0);
  for (const source of config.sources) await page.getByText(source.name, { exact: true }).waitFor();
  phase = 'offline';
  await refresh();
  await page.getByRole('tab', { name: 'チケット', exact: true }).click();
  await expectCards(3);
  assert.equal(await page.getByText('一部は前回取得の情報です · 取得状況を確認').count(), 3);
  // No timed polling while the screen stays open.
  await page.clock.install();
  const before = requests;
  await page.clock.runFor(65000);
  assert.equal(requests, before);
  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
  console.log('PASS: 端末直接取得・検索・カレンダー月移動/日付選択/解除/検索併用/掲載終了・詳細・会場の地図リンク・重複統合・新着/既読保存・お気に入り登録/解除/保存・掲載終了・403/オフライン・自動巡回なし');
} finally { await browser.close(); }
