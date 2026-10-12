import { load } from 'cheerio/slim';
import { fetchHtml } from './collector.mjs';

export const officialSource = { id: 'official', name: 'ゆるめるモ！公式サイト', allowedHosts: ['ylmlm.jp'] };
const key = value => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const ticketUrl = value => {
  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`);
    const host = url.hostname.replace(/^www\./, '').replace(/^t-dv\.com$/, 'ticketdive.com');
    if (!['ticketdive.com', 'livepocket.jp', 't.livepocket.jp', 'tiget.net', 'eplus.jp'].includes(host)) return null;
    let path = url.pathname.replace(/\/$/, '');
    if (url.hostname === 't-dv.com') path = `/event${path}`;
    // Artist and search pages are not event identifiers.
    if (!(host === 'ticketdive.com' && /^\/event\/[\w-]+$/.test(path) || /livepocket/.test(host) && /^\/e\/[\w-]+$/.test(path) || host === 'tiget.net' && /^\/events\/\d+$/.test(path) || host === 'eplus.jp' && /^\/sf\/detail\//.test(path))) return null;
    return `${host}${path}`;
  } catch { return null; }
};
const officialPostUrl = value => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com'].includes(url.hostname)) return null;
    const match = url.pathname.match(/^\/ylmlm_official\/status\/(\d+)\/?$/i);
    return match ? `https://x.com/ylmlm_official/status/${match[1]}` : null;
  } catch { return null; }
};
const timePattern = '(?:[01]?\\d|2[0-3]):[0-5]\\d(?:\\s*[-〜～~–—]\\s*(?:[01]?\\d|2[0-3]):[0-5]\\d)?';
function labelledTimes(lines, label) {
  const before = new RegExp(`^[^\\p{L}\\p{N}]*${label}[\\s:：.…・|｜]*(${timePattern})(?!\\d)`, 'u');
  const after = new RegExp(`^[^\\p{L}\\p{N}]*(${timePattern})[\\s:：.…・|｜]*${label}`, 'u');
  return [...new Set(lines.flatMap(line => { const match = line.match(before) || line.match(after); return match ? [match[1].replace(/\s+/g, '').replace(/[〜～~–—]/g, '〜')] : []; }))];
}
// Keep original clauses, rather than inventing a summary. Recognized boilerplate
// is removed; an unfamiliar caution in a notice section is kept conservatively.
export function extractOfficialSupplements(text, title = '', venue = '') {
  const result = [];
  let ticketContext = '';
  let noticeSection = false;
  const generic = /^(?:最新(?:の)?(?:情報|料金|日時|販売状況).*?(?:公式|購入先|チケットサイト).*?確認.*|(?:内容|時間|スケジュール)は(?:予告なく|諸事情により).*?変更.*|(?:あらかじめ|予め)ご了承.*|(?:各券?|各チケット|別途)?\s*\+?\s*1\s*(?:D|Drink|ドリンク).*|(?:各)?D代別|(?:チケットの)?購入(?:はこちら|先).*|さらに詳細を表示|#.*)$/i;
  const specific = /※|注意|禁止|不可|できません|出来ません|必須|必要|持参|提示|対象|限定|条件|予約のみ|当日支払|再入場|撮影|録音|録画|年齢|未成年|保護者|身分証|学生証|整理番号|入場順|受付|リストバンド|集合|特典|チェキ|仮装|衣装|準備する権|無料|飲み放題|ビュッフェ|アルコール|アフタートーク|映像鑑賞|ビンゴ|粘土|品評会|銅像|中止|延期|変更|返金|払戻|変更前|変更後/;
  for (const raw of text.normalize('NFKC').split(/\n|(?<=。)/u)) {
    const line = raw.replace(/https?:\/\/\S+|(?:ticketdive\.com|t-dv\.com|(?:t\.)?livepocket\.jp|tiget\.net|eplus\.jp)\/\S+/g, '').replace(/^[^\p{L}\p{N}※]+/u, '').trim();
    const hasCondition = /禁止|不可|限定|持参|提示|再入場|撮影|身分証|学生証|不要|無料|飲み放題|特典|チェキ/.test(line);
    if (!line || generic.test(line.replace(/^※\s*/, '')) && !hasCondition || key(line) === key(title) || venue && key(line) === key(venue)) continue;
    if (/^(?:注意事項|ご注意|参加条件|特記事項|撮影について|特典について)[:：]?$/.test(line.replace(/[【】\[\]]/g, ''))) { noticeSection = true; ticketContext = ''; continue; }
    const ticket = line.match(/^(.{1,30}?(?:チケット|席|券))\s*[¥￥]/);
    if (ticket) ticketContext = ticket[1].trim();
    if (/[¥￥]\s*[\d,.]+|\d[\d,]*円/.test(line) && !hasCondition && !/予約のみ|当日支払|参加条件|持参|提示|対象/.test(line)) continue;
    const isTime = labelledTimes([line], '(?:ライブ|出演時間|出演時刻|出番|特典会(?:時間)?|物販(?:時間)?)').length > 0;
    const basic = /^(?:日程|開催日|日時|会場|時間|開場|開演|OPEN|START|出演|出演者|料金|販売期間|販売開始|抽選申し込み|当落|入金期間|一般チケット発売|チケットURL)[:：\s]|^\d{4}年\s*\d{1,2}月|^\d{1,2}月\d{1,2}日|^(?:前売|当日|優先入場|一般).*?[¥￥\d]/i.test(line);
    if (isTime || basic && !specific.test(line)) { noticeSection = false; ticketContext = ''; continue; }
    if (!specific.test(line) && !noticeSection) continue;
    // Price-only headings provide context for the following ticket benefits.
    const clean = line.replace(/[¥￥]\s*[\d,.]+-?(?:円)?|\d[\d,]*円/g, '').replace(/^料金[:：]\s*/, '').replace(/\s+/g, ' ').trim();
    const qualified = ticketContext && !ticket && /特典|チェキ|準備する権|当日限り|引換|引き換え/.test(clean) ? `${ticketContext}：${clean}` : clean;
    if (qualified && !result.includes(qualified)) result.push(qualified);
  }
  return result;
}
export function extractOfficialAnnouncements(html) {
  const $ = load(html);
  if (!$('.simcal-calendar').length) throw new Error('公式カレンダーの形式を確認できません');
  const announcements = [];
  $('.simcal-event-details').each((_, element) => {
    const entry = $(element);
    const date = entry.find('[itemprop="startDate"]').attr('content')?.slice(0, 10);
    const title = entry.find('.simcal-event-title').first().text().trim();
    const description = entry.find('.simcal-event-description').clone();
    description.find('script,style,noscript').remove();
    description.find('br').replaceWith('\n');
    description.find('p,div,li').append('\n');
    const text = description.text().normalize('NFKC').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !title || !text) return;
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    const links = [];
    entry.find('a[href]').each((_, a) => links.push($(a).attr('href')));
    links.push(...[...text.matchAll(/(?:https?:\/\/)?(?:ticketdive\.com|t-dv\.com|(?:t\.)?livepocket\.jp|tiget\.net|eplus\.jp)\/[A-Za-z0-9_/?=&%-]+/g)].filter(match => !/[.…]/.test(text[match.index + match[0].length] ?? '')).map(match => match[0]));
    links.push(...(text.match(/https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/ylmlm_official\/status\/\d+(?:\?[A-Za-z0-9_=&%-]*)?(?=$|[\s<>()。、「」])/gi) ?? []));
    const postUrls = [...new Set(links.map(officialPostUrl).filter(Boolean))];
    const venue = entry.find('[itemprop="location"]').text().trim() || lines.find(line => /会場|🏟|📍/.test(line) && !/開場|OPEN|START/.test(line))?.replace(/^.*?(?:会場[:：]|[🏟📍]️?[|｜\s]*)/u, '').trim() || '';
    const performance = labelledTimes(lines, '(?:ライブ|出演時間|出演時刻|出番)');
    const meetAndGreet = labelledTimes(lines, '(?:特典会(?:時間)?|物販(?:時間)?)');
    announcements.push({ date, title, venue, ticketUrls: [...new Set(links.map(ticketUrl).filter(Boolean))], performance, meetAndGreet, text, postUrls, url: 'https://ylmlm.jp/#schedule' });
  });
  if ($('.simcal-event-details').length && !announcements.length) throw new Error('公式告知の本文を確認できません');
  return announcements;
}
export async function collectOfficialDetails({ signal, fetchPage } = {}) {
  const checkedAt = new Date().toISOString();
  try {
    const page = await (fetchPage ? fetchPage('https://ylmlm.jp/', officialSource) : fetchHtml('https://ylmlm.jp/', officialSource, { signal }));
    if (signal?.aborted) throw new Error('取得を中断しました');
    const announcements = extractOfficialAnnouncements(page.html);
    return { status: 'ok', announcements, checkedAt, errors: [] };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { status: 'error', announcements: [], checkedAt, errors: [error.message] };
  }
}
export function applyOfficialResult(previous, result) {
  return { ...result, announcements: result.status === 'ok' ? result.announcements : previous?.announcements ?? [], lastSuccessAt: result.status === 'ok' ? result.checkedAt : previous?.lastSuccessAt ?? null };
}
function matches(event, announcement) {
  if (event.date !== announcement.date) return false;
  if (event.sourceUrls.some(url => announcement.ticketUrls.includes(ticketUrl(url)))) return true;
  if (key(event.title) === key(announcement.title)) {
    const venue = key(event.venue), other = key(announcement.venue);
    return !venue || !other || venue.includes(other) || other.includes(venue);
  }
  const titles = value => [...value.matchAll(/[「『](.+?)[」』]/g)].map(match => key(match[1])).filter(value => value.length >= 6);
  const venue = key(event.venue), other = key(announcement.venue);
  return !!venue && !!other && (venue.includes(other) || other.includes(venue)) && titles(event.title).some(title => titles(announcement.title).includes(title));
}
export function enrichWithOfficialDetails(events, snapshot) {
  if (!snapshot) return events;
  // A notice matching several ticket events is ambiguous (e.g. two sessions).
  const assignments = (snapshot.announcements ?? []).map(announcement => ({ announcement, candidates: events.filter(event => matches(event, announcement)) })).filter(item => item.candidates.length === 1);
  return events.map(event => {
    const notices = assignments.filter(item => item.candidates[0].id === event.id).map(item => item.announcement);
    if (!notices.length) return event;
    return { ...event, officialDetails: { performance: [...new Set(notices.flatMap(n => n.performance))], meetAndGreet: [...new Set(notices.flatMap(n => n.meetAndGreet))], supplements: [...new Set(notices.flatMap(n => extractOfficialSupplements(n.text, n.title, n.venue)))], postUrls: [...new Set(notices.flatMap(n => (n.postUrls ?? []).map(officialPostUrl).filter(Boolean)))], url: 'https://ylmlm.jp/#schedule', checkedAt: snapshot.lastSuccessAt ?? snapshot.checkedAt, stale: snapshot.status !== 'ok' } };
  });
}
