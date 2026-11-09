// A page failure does not mean the entire refresh failed. Keep the source's
// error details and stale snapshots, but describe the overall outcome accurately.
export function refreshStatus(results, failure = '') {
  const checked = results.filter(result => result.status !== 'pending');
  const failed = checked.filter(result => result.status !== 'ok');
  if (!failed.length && !failure) return null;
  const updated = results.some(result => result.status === 'ok' || (result.events?.length ?? 0) > 0);
  const names = [...new Set(failed.map(result => result.name))].join('・');
  return {
    tone: updated ? 'warning' : 'error',
    message: `${updated ? '取得できた情報を更新しました。' : '情報を更新できませんでした。'}${names ? `${names}の情報を一部または全部確認できませんでした。` : ''}${failure ? ` ${failure}` : ''}取得状況から詳細を確認できます。`,
  };
}
