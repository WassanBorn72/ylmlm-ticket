import { chromium } from 'playwright';
import assert from 'node:assert/strict';

// ビルド済み Web を先に配信してください。外部サイトには接続しません。
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  headless: true,
  args: process.env.CI ? ['--no-sandbox'] : [],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const cards = () => page.getByRole('button', { name: /詳細を表示$/ });
const expectCards = async count => {
  await page.waitForFunction(expected => document.querySelectorAll('[role="button"][aria-label$="詳細を表示"]').length === expected, count);
  assert.equal(await cards().count(), count);
};
try {
  await page.goto(process.env.WEB_TEST_URL || 'http://127.0.0.1:8081');
  await page.getByText('サンプル表示 · 掲載内容は実際の公演情報ではありません').waitFor();
  await expectCards(4);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  if (process.env.SCREENSHOT_PATH) await page.screenshot({ path: process.env.SCREENSHOT_PATH, fullPage: true });
  await page.getByLabel('公演名・会場で検索').fill('大阪');
  await expectCards(1);
  await cards().first().click();
  await page.getByText('公演・チケット詳細').waitFor();
  assert.equal(await page.getByRole('link', { name: /サンプル/ }).count(), 1);
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.getByRole('button', { name: '検索をクリア' }).click();
  await page.getByRole('button', { name: 'TIGET', exact: true }).click();
  await expectCards(1);
  await page.getByRole('button', { name: 'すべて', exact: true }).click();
  await page.getByRole('button', { name: 'お気に入りに追加' }).first().click();
  await page.getByRole('tab', { name: 'お気に入り', exact: true }).click();
  await expectCards(1);
  await page.reload();
  await page.getByRole('tab', { name: 'お気に入り', exact: true }).click();
  await expectCards(1);
  await page.getByRole('tab', { name: /^新着/ }).click();
  await expectCards(2);
  await page.getByRole('button', { name: 'すべて既読にする', exact: true }).click();
  await page.getByText('新着はすべてチェック済み').waitFor();
  await page.reload();
  await page.getByRole('tab', { name: /^新着/ }).click();
  await page.getByText('新着はすべてチェック済み').waitFor();
  await expectCards(0);
  await page.getByRole('tab', { name: '設定', exact: true }).click();
  await page.getByRole('button', { name: '新着通知をオンにする' }).click();
  await page.getByText('サンプル表示では通知を登録できません。実データの API 接続先を設定してください。').waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: スマホ表示・検索・詳細・サイト絞り込み・お気に入り保存・既読保存・通知設定');
} finally { await browser.close(); }
