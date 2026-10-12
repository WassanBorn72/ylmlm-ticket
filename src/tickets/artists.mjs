const memberMention = (title, name) => {
  const escaped = clean(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}]|生誕|ソロ|個人|トーク|イベント|プロデュース|ライブ|の|出演|birthday)`, 'u').test(clean(title));
};
const clean = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
export function matchingArtists(title, performers, description, config) {
  const searchable = clean([title, performers, description].join(' '));
  const group = [config.artist, ...(config.aliases ?? [])].some(alias => searchable.includes(clean(alias)));
  const units = (config.targets ?? []).filter(target => ['unit', 'collaboration'].includes(target.kind) && [target.name, ...(target.aliases ?? [])].some(alias => searchable.includes(clean(alias))));
  const tokens = String(performers ?? '').normalize('NFKC').split(/[,、/／|\n;；]/).map(clean);
  const members = (config.targets ?? []).filter(target => target.kind === 'member' && group && [target.name, ...(target.aliases ?? [])].some(alias => {
    const name = clean(alias);
    const affiliated = value => [config.artist, ...(config.aliases ?? [])].some(alias => clean(value).includes(clean(alias)));
    return tokens.some(token => (token.startsWith(`${name}(`) || token.startsWith(`${name}【`)) && affiliated(token)) || (clean(title).startsWith(`${name}(`) || clean(title).startsWith(`${name}【`)) && affiliated(title);
  }));
  return [...(group ? [{ id: 'group', name: config.artist, kind: 'group' }] : []), ...units, ...members].map(({ id, name, kind }) => ({ id, name, kind }));
}
export function officialArtistHints(announcements, config) {
  const hints = [];
  for (const announcement of announcements ?? []) {
    let artists = matchingArtists(announcement.title, '', '', config);
    if (!artists.some(a => ['unit', 'collaboration'].includes(a.kind))) {
      const title = announcement.title;
      const members = (config.targets ?? []).filter(target => target.kind === 'member' && [target.name, ...(target.aliases ?? [])].some(name => memberMention(title, name)));
      artists = [...artists, ...members.map(({ id, name, kind }) => ({ id, name, kind }))];
    }
    artists = artists.filter(artist => artist.kind !== 'group');
    if (!artists.length) continue;
    for (const url of announcement.ticketUrls ?? []) hints.push({ url: `https://${url}`, date: announcement.date, artists });
  }
  return hints;
}
