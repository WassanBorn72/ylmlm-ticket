import { chromium } from 'playwright';
import assert from 'node:assert/strict';

// 実 API に接続した Web 版の起動が必要。購入ボタンは操作せず、表示を検証します。
const apiUrl = process.env.API_TEST_URL || 'http://localhost:3001';
const response = await fetch(`${apiUrl}/api/events`);
assert.equal(response.status, 200);
const feed = await response.json();
assert.ok(feed.events.length > 0, 'API に実公演が必要です');
for (const name of ['TicketDive', 'LivePocket', 'TIGET', 'イープラス']) {
  assert.equal(feed.sources.find(source => source.name === name)?.status, 'ok', `${name} の実取得状態`);
}
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  headless: true, args: process.env.CI ? ['--no-sandbox'] : [],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const cards = () => page.getByRole('button', { name: /詳細を表示$/ });
try {
  await page.goto(process.env.WEB_TEST_URL || 'http://localhost:8081');
  await cards().first().waitFor();
  assert.equal(await cards().count(), feed.events.length);
  assert.equal(await page.getByText('サンプル表示 · 掲載内容は実際の公演情報ではありません').count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  if (process.env.SCREENSHOT_PATH) await page.screenshot({ path: process.env.SCREENSHOT_PATH, fullPage: true });
  // 検証時点の公演が残っている場合は、注意書きと購入先の統合も画面で確認。
  if (feed.events.some(event => event.title.includes('ハロウィンパーティー'))) {
    await page.getByLabel('公演名・会場で検索').fill('ハロウィンパーティー');
    await page.getByText('時間の記載に差があります · 詳細を確認').waitFor();
    await cards().first().click();
    await page.getByText(/TicketDive: 概要と詳細で時間が異なります/).waitFor();
    await page.getByRole('button', { name: '閉じる', exact: true }).click();
  }
  const shared = feed.events.find(event => event.title.includes('YOIMACHI') && event.offers.some(offer => offer.sourceName === 'イープラス') && event.offers.some(offer => offer.sourceName === 'LivePocket'));
  if (shared) {
    await page.getByLabel('公演名・会場で検索').fill('YOIMACHI');
    await cards().first().click();
    assert.equal(await page.getByRole('link', { name: /LivePocket/ }).count(), 1);
    assert.equal(await page.getByRole('link', { name: /イープラス.*購入先で確認/ }).count(), 1);
    await page.getByRole('button', { name: '閉じる', exact: true }).click();
  }
  await page.getByRole('tab', { name: '設定', exact: true }).click();
  for (const name of ['TicketDive', 'LivePocket', 'TIGET', 'イープラス', 'ローチケ', 'Buzzチケ']) await page.getByText(name, { exact: true }).waitFor();
  if (feed.sources.find(source => source.name === 'Buzzチケ')?.status === 'error') await page.getByText('取得先の応答: HTTP 403', { exact: true }).waitFor();
  // 障害時も架空公演に切り替わらないことを確認。
  await page.route('**/api/events', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"smoke-test failure"}' }));
  await page.reload();
  await page.getByText(/更新できませんでした/).waitFor();
  assert.equal(await page.getByText('サンプル表示 · 掲載内容は実際の公演情報ではありません').count(), 0);
  assert.deepEqual(errors, []);
  console.log(`PASS: 実 API の ${feed.events.length} 公演、注意表示、購入先統合、取得状態、API 障害時の表示`);
} finally { await browser.close(); }
