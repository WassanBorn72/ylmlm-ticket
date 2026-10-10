import { load } from 'cheerio';
import { createHash } from 'node:crypto';

export const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
export const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 24);

export function checkedUrl(value, hosts) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !hosts.includes(url.hostname)) {
    throw new Error('許可された HTTPS ホスト以外の URL は取得できません');
  }
  url.hash = '';
  return url.href;
}

function objects(value) {
  if (Array.isArray(value)) return value.flatMap(objects);
  if (!value || typeof value !== 'object') return [];
  return [value, ...objects(value['@graph']), ...objects(value.subEvent)];
}

function dateInfo(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const zoned = dateOnly ? `${value}T00:00:00+09:00` : /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}+09:00`;
  const instant = new Date(zoned);
  if (!Number.isFinite(instant.getTime())) return null;
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
  if (dateOnly && date !== value) return null;
  return { date, startAt: dateOnly ? null : instant.toISOString() };
}

function ticketUrl(value, fallback) {
  try {
    const url = new URL(value || fallback, fallback);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : fallback;
  } catch { return fallback; }
}

export function extractEvents(html, pageUrl, source, config) {
  const $ = load(html);
  const data = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try { data.push(...objects(JSON.parse($(el).text()))); } catch { /* 他の JSON-LD が壊れていても有効な Event は読み取る */ }
  });
  const structuredEvents = data.filter(item => [].concat(item['@type'] ?? []).some(type => /^(?:https?:\/\/schema.org\/)?(?:MusicEvent|Event|Festival)$/.test(type)));
  if (!structuredEvents.length) throw new Error('Event JSON-LD がありません。サイト専用アダプターの検証が必要です');
  const aliases = [config.artist, ...(config.aliases ?? [])].map(normalize);
  return structuredEvents.flatMap(item => {
    const searchable = normalize([item.name, item.description, ...[].concat(item.performer ?? []).map(p => typeof p === 'string' ? p : p.name)].join(' '));
    if (!aliases.some(alias => searchable.includes(alias))) return [];
    const time = dateInfo(item.startDate);
    if (!time || !item.name) throw new Error('対象公演のタイトルまたは開催日を読み取れません');
    const location = Array.isArray(item.location) ? item.location[0] : item.location;
    const venue = typeof location === 'string' ? location : location?.name || '会場未発表';
    const address = typeof location?.address === 'string' ? location.address : [location?.address?.addressRegion, location?.address?.addressLocality, location?.address?.streetAddress].filter(Boolean).join(' ');
    const offers = [].concat(item.offers ?? []).flatMap(offer => offer.offers ? [].concat(offer.offers) : [offer]);
    const normalizedOffers = (offers.length ? offers : [{}]).map(offer => {
      const raw = offer.price ?? offer.lowPrice;
      const amount = raw !== undefined && raw !== null && raw !== '' && Number.isFinite(Number(raw)) && Number(raw) >= 0 ? Number(raw) : null;
      return {
        sourceId: source.id, sourceName: source.name,
        label: offer.name || (offer.lowPrice !== undefined ? '最低価格' : 'チケット'),
        price: amount, currency: offer.priceCurrency || (amount === null ? null : 'JPY'),
        url: ticketUrl(offer.url, pageUrl),
        availability: offer.availability ? String(offer.availability).split('/').pop() : null,
      };
    });
    const doorValue = typeof item.doorTime === 'string' && /^\d{2}:\d{2}(?::\d{2})?$/.test(item.doorTime) ? `${time.date}T${item.doorTime}+09:00` : item.doorTime;
    const doors = doorValue ? dateInfo(doorValue)?.startAt ?? null : null;
    return [{
      id: hash(`${time.date}|${time.startAt ?? 'unknown'}|${normalize(item.name)}|${normalize(venue)}`),
      title: String(item.name), ...time, doorsAt: doors, venue, address,
      offers: normalizedOffers, sourceUrls: [pageUrl],
    }];
  });
}

export function discoverEventUrls(html, listingUrl, source) {
  const $ = load(html);
  const pattern = new RegExp(source.eventPathPattern);
  const urls = new Set();
  $('a[href]').each((_, el) => {
    try {
      const candidate = checkedUrl(new URL($(el).attr('href'), listingUrl).href, source.allowedHosts);
      if (pattern.test(new URL(candidate).pathname)) urls.add(candidate);
    } catch { /* 外部リンクや HTTP は巡回しない */ }
  });
  return [...urls];
}
