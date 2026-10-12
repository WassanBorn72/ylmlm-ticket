import { matchingArtists } from './artists.mjs';
import { load } from 'cheerio/slim';
import { extractEvents, normalizeEvents, normalize } from './extract.mjs';

const text = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const date = value => {
  if (/[〜～]/.test(text(value)) || [...text(value).matchAll(/\d{4}[年/.-]\d{1,2}[月/.-]\d{1,2}/g)].length > 1) throw new Error('複数開催日の形式は個別公演への分割が必要です');
  const match = text(value).match(/(\d{4})[年/.-](\d{1,2})[月/.-](\d{1,2})(?:日|\b)/);
  if (!match) throw new Error('開催日の HTML 形式を読み取れません');
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
};
const clock = (value, label) => text(value).match(new RegExp(`${label}(?:時刻|時間)?\\s*[:：]?\\s*([0-2]?\\d:[0-5]\\d)`))?.[1]?.padStart(5, '0') ?? null;
const instant = (day, time) => time ? `${day}T${time}:00+09:00` : day;
const definitions = ($, scope = '') => {
  const result = new Map();
  $(`${scope}${scope ? ' ' : ''}dt`).each((_, el) => {
    const label = text($(el).text());
    if (!result.has(label)) result.set(label, $(el).next('dd'));
  });
  return result;
};
const performerMatches = (value, config, pageUrl) => matchingArtists(value, value, '', config).length > 0 || config.officialHints?.some(hint => hint.url === pageUrl);
const price = value => {
  const match = text(value).match(/(?:[¥￥]\s*([\d,]+)|([\d,]+)\s*円)/);
  return match ? Number((match[1] ?? match[2]).replace(/,/g, '')) : /^(?:無料|FREE)$/i.test(text(value)) ? 0 : null;
};

function tiget($, pageUrl, source, config) {
  const title = text($('.pg-event__header__title').text());
  if (!title) throw new Error('TIGET の公演情報欄が見つかりません');
  const fields = definitions($);
  const performers = fields.get('出演者')?.text() ?? '';
  if (!performerMatches(`${title} ${performers}`, config, pageUrl)) return [];
  const day = date(fields.get('開催日')?.text());
  const venueNode = fields.get('会場');
  const venue = text(venueNode?.find('a').first().text() || venueNode?.text());
  const groups = new Map();
  $('dd.pg-event__detail__ticket').each((_, el) => {
    const node = $(el);
    const timing = node.prev('dt').text();
    const start = clock(timing, '開演');
    const doors = clock(timing, '開場');
    const key = `${start ?? 'unknown'}|${doors ?? 'unknown'}`;
    if (!groups.has(key)) groups.set(key, { name: title, startDate: instant(day, start), doorTime: doors, location: { name: venue }, performer: { name: performers }, offers: [] });
    const label = text(node.find('h6').text()).replace(/^●(?:予約|販売|電子チケット)/, '').replace(/^\(|\)$/g, '');
    node.children('p').each((_, p) => {
      const line = text($(p).text());
      const kind = line.match(/^(前売券|当日券)\s*[:：]/)?.[1];
      if (!kind) return;
      groups.get(key).offers.push({ name: `${label} / ${kind}`, price: price(line), priceCurrency: 'JPY', url: pageUrl, note: text($(p).find('span').text()) || undefined });
    });
  });
  if (!groups.size) throw new Error('TIGET の券種・開場／開演欄を読み取れません');
  return normalizeEvents([...groups.values()], pageUrl, source, config);
}

function ticketdive($, pageUrl, source, config) {
  const title = text($('[class*="EventInfoUnit_name__"]').first().text());
  if (!title) throw new Error('TicketDive の公演情報欄が見つかりません');
  const fields = new Map();
  $('[class*="EventInfoUnit_detailContainer__"] span').each((_, el) => {
    const label = text($(el).text());
    if (['公演日時', '会場', '出演'].includes(label)) fields.set(label, $(el).next('span').text());
  });
  if (!performerMatches(`${title} ${fields.get('出演') ?? ''}`, config, pageUrl)) return [];
  const day = date(fields.get('公演日時'));
  const timing = fields.get('公演日時');
  const start = clock(timing, '開演');
  const doors = clock(timing, '開場');
  const detail = $('[class*="EventDetailUnit_detail__"]').first();
  const detailText = detail.text().normalize('NFKC');
  const detailedVenue = detailText.match(/(?:^|\n)\s*会\s*場\s*[:：]\s*([^\n]+)/)?.[1]?.trim();
  const notes = [];
  const detailStart = clock(detailText, '開演');
  const detailDoors = clock(detailText, '開場');
  if ((detailStart && start && detailStart !== start) || (detailDoors && doors && detailDoors !== doors)) {
    notes.push(`概要と詳細で時間が異なります。概要: 開場 ${doors ?? '不明'} / 開演 ${start ?? '不明'}。詳細: 開場 ${detailDoors ?? '不明'} / 開演 ${detailStart ?? '不明'}。購入先で確認してください。`);
  }
  const offers = [];
  $('[class*="TicketTypeCard_ticketTypeContainer__"]').each((_, el) => {
    const card = $(el);
    const row = card.children('div').first();
    const label = text(row.children('span').first().text());
    const amount = price(row.children('span').last().text());
    if (!label || amount === null) throw new Error('TicketDive の券種または料金を読み取れません');
    offers.push({ name: label, price: amount, priceCurrency: 'JPY', url: pageUrl, note: text(card.children('span').text()) || undefined });
  });
  if (!offers.length) notes.push('券種の料金が HTML に見つかりません。購入先で確認してください。');
  return normalizeEvents([{ name: title, startDate: instant(day, start), doorTime: doors, location: { name: detailedVenue || fields.get('会場') }, performer: { name: fields.get('出演') }, offers, notes }], pageUrl, source, config);
}

function livepocket($, pageUrl, source, config) {
  const fields = definitions($, '.event-detail-info');
  const title = text($('.event-detail h1').first().text());
  if (!title) throw new Error('LivePocket の公演情報欄が見つかりません');
  const performers = fields.get('出演者')?.text() ?? '';
  if (!performerMatches(`${title} ${performers}`, config, pageUrl)) return [];
  const day = date(fields.get('開催日')?.text());
  const timing = fields.get('時間')?.text();
  const venueNode = fields.get('会場');
  const address = text(venueNode?.children('span').text());
  const venue = text(venueNode?.clone().children().remove().end().text()).replace(/\s*\([^()]*県?\)$/, '').trim();
  const offers = [];
  $('.event-detail-ticket-card').each((_, el) => {
    const card = $(el);
    const label = text(card.find('.event-detail-ticket-card__title').text());
    const amount = price(card.find('.event-detail-ticket-card__price').text());
    const status = text(card.find('.event-detail-ticket-card__status').text());
    if (!label || amount === null) throw new Error('LivePocket の券種または料金を読み取れません');
    offers.push({ name: label, price: amount, priceCurrency: 'JPY', url: pageUrl, availability: /売切|完売|販売終了/.test(status) ? 'SoldOut' : /販売前/.test(status) ? 'PreOrder' : /販売中/.test(status) ? 'InStock' : null });
  });
  return normalizeEvents([{ name: title, startDate: instant(day, clock(timing, '開演')), doorTime: clock(timing, '開場'), location: { name: venue, address }, performer: { name: performers }, offers }], pageUrl, source, config);
}

function eplus($, pageUrl, source, config) {
  const events = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try { const value = JSON.parse($(el).text()); if (value['@type'] === 'Event') events.push(value); } catch { /* 有効な Event の有無は後で検証 */ }
  });
  if (!events.length || !$('.section--s4-detail').length) throw new Error('イープラスの公演詳細形式を読み取れません');
  if (events.length > 1) throw new Error('イープラスの複数公演形式は個別日時の検証が必要です');
  const performers = definitions($, '.ticket-detail__content').get('出演')?.text() ?? '';
  const timing = $('.block-ticket-article__time').first().text();
  return normalizeEvents(events.map(event => ({
    ...event, performer: { name: performers }, doorTime: clock(timing, '開場'),
    notes: event.offers?.length ? [] : ['公開公演ページに券種の料金がありません。購入先で確認してください。'],
  })), pageUrl, source, config);
}

export function extractSiteEvents(html, pageUrl, source, config) {
  if (!source.adapter) return extractEvents(html, pageUrl, source, config);
  const adapter = { tiget, ticketdive, livepocket, eplus }[source.adapter];
  if (!adapter) throw new Error(`${source.name} の公演詳細アダプターは未検証です`);
  return adapter(load(html), pageUrl, source, config);
}
