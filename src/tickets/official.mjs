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
const timePattern = '(?:[01]?\\d|2[0-3]):[0-5]\\d(?:\\s*[-〜～~–—]\\s*(?:[01]?\\d|2[0-3]):[0-5]\\d)?';
function labelledTimes(lines, label) {
  const before = new RegExp(`^[^\\p{L}\\p{N}]*${label}[\\s:：.…・|｜]*(${timePattern})(?!\\d)`, 'u');
  const after = new RegExp(`^[^\\p{L}\\p{N}]*(${timePattern})[\\s:：.…・|｜]*${label}`, 'u');
  return [...new Set(lines.flatMap(line => { const match = line.match(before) || line.match(after); return match ? [match[1].replace(/\s+/g, '').replace(/[〜～~–—]/g, '〜')] : []; }))];
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
    const venue = entry.find('[itemprop="location"]').text().trim() || lines.find(line => /会場|🏟|📍/.test(line) && !/開場|OPEN|START/.test(line))?.replace(/^.*?(?:会場[:：]|[🏟📍]️?[|｜\s]*)/u, '').trim() || '';
    const performance = labelledTimes(lines, '(?:ライブ|出演時間|出演時刻|出番)');
    const meetAndGreet = labelledTimes(lines, '(?:特典会(?:時間)?|物販(?:時間)?)');
    announcements.push({ date, title, venue, ticketUrls: [...new Set(links.map(ticketUrl).filter(Boolean))], performance, meetAndGreet, text: text.slice(0, 4000), url: 'https://ylmlm.jp/#schedule' });
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
    return { ...event, officialDetails: { performance: [...new Set(notices.flatMap(n => n.performance))], meetAndGreet: [...new Set(notices.flatMap(n => n.meetAndGreet))], supplements: [...new Set(notices.map(n => n.text))], url: 'https://ylmlm.jp/#schedule', checkedAt: snapshot.lastSuccessAt ?? snapshot.checkedAt, stale: snapshot.status !== 'ok' } };
  });
}
