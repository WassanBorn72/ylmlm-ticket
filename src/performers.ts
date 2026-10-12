export function performerLabel(artist: { id: string; name: string; kind: string }, includeKind = true): string {
  return `${includeKind && artist.kind === 'collaboration' ? '外部コラボ：' : ''}${artist.name}`;
}
