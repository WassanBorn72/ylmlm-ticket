import config from './tickets/sources.json';

// Resolve metadata by stable ID so existing cached events also show participants.
export function performerLabel(artist: { id: string; name: string; kind: string }, includeKind = true): string {
  if (artist.kind !== 'collaboration') return artist.name;
  const target = config.targets.find(target => target.id === artist.id);
  const participants = target && 'participantIds' in target
    ? target.participantIds?.map(id => config.targets.find(member => member.id === id)?.name).filter(Boolean) ?? []
    : [];
  return `${includeKind ? '外部コラボ：' : ''}${artist.name}${participants.length ? `（${participants.join('・')}参加）` : ''}`;
}
