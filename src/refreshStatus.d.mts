export type RefreshStatus = { tone: 'warning' | 'error'; message: string };
export function refreshStatus(results: {status: string; name: string; events?: unknown[]}[], failure?: string): RefreshStatus | null;
