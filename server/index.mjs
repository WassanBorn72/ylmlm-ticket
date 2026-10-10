import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Store } from './store.mjs';
import { readConfig, collect } from './collector.mjs';
import { deliver } from './notifications.mjs';

const tokenPattern = /^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/;

async function jsonBody(request) {
  let text = '';
  for await (const chunk of request) {
    text += chunk.toString();
    if (text.length > 4096) throw new Error('リクエストが大きすぎます');
  }
  return JSON.parse(text);
}

export function createApi(store, config, { origins = ['http://localhost:8081'], now = () => new Date() } = {}) {
  const rates = new Map();
  return createServer(async (request, response) => {
    const origin = request.headers.origin;
    const allowedOrigin = origin && origins.includes(origin);
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
    if (allowedOrigin) Object.assign(headers, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    const reply = (status, body) => { response.writeHead(status, headers); response.end(JSON.stringify(body)); };
    if (origin && !allowedOrigin) return reply(403, { error: 'このオリジンは許可されていません' });
    if (request.method === 'OPTIONS') return reply(204, null);
    const url = new URL(request.url, 'http://localhost');
    try {
      if (request.method === 'GET' && url.pathname === '/health') return reply(200, { ok: true, configuredSources: config.sources.length });
      if (request.method === 'GET' && url.pathname === '/api/events') {
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now());
        const events = Object.values(store.state.events).filter(event => event.date >= today).sort((a, b) => a.date.localeCompare(b.date) || (a.startAt ?? '').localeCompare(b.startAt ?? ''));
        return reply(200, { events, lastSyncAt: store.state.lastSyncAt, sources: config.sources.map(source => ({ id: source.id, name: source.name, ...(store.state.sourceStatus[source.id] ?? { status: 'pending', errors: [] }) })) });
      }
      if (request.method === 'POST' && url.pathname === '/api/subscriptions') {
        const address = request.socket.remoteAddress;
        const minute = Math.floor(Date.now() / 60000);
        const count = rates.get(address);
        if (count?.minute === minute && count.count >= 20) return reply(429, { error: '時間をおいて再試行してください' });
        if (rates.size > 10000) rates.clear();
        rates.set(address, { minute, count: count?.minute === minute ? count.count + 1 : 1 });
        const { token } = await jsonBody(request);
        if (typeof token !== 'string' || !tokenPattern.test(token)) return reply(400, { error: 'Expo Push Token が不正です' });
        // 再登録で別端末の解除キーを返さない。既存所有者はローカルに保存したキーを使用する。
        const existing = Object.values(store.state.subscriptions).some(subscription => subscription.token === token);
        if (existing) return reply(409, { error: 'この端末は登録済みです。保存済みの通知設定を使用してください' });
        const id = randomUUID();
        store.state.subscriptions[id] = { token, registeredAt: now().toISOString() };
        store.save();
        return reply(201, { id });
      }
      if (request.method === 'DELETE' && /^\/api\/subscriptions\/[0-9a-f-]{36}$/.test(url.pathname)) {
        const id = url.pathname.split('/').pop();
        delete store.state.subscriptions[id];
        for (const item of store.state.outbox) if (item.subscriptionId === id && !item.deliveredAt) item.dead = true;
        store.save();
        return reply(200, { ok: true });
      }
      return reply(404, { error: '見つかりません' });
    } catch { return reply(400, { error: 'リクエストを処理できません' }); }
  });
}

async function main() {
  const config = readConfig(resolve(process.env.SOURCE_CONFIG || 'server/sources.json'));
  const store = new Store(resolve(process.env.DATA_DIR || 'server/data'));
  const server = createApi(store, config, { origins: (process.env.ALLOWED_ORIGINS || 'http://localhost:8081').split(',').map(value => value.trim()) });
  const interval = Number(process.env.POLL_INTERVAL_MS || 900000);
  if (!Number.isFinite(interval) || interval < 60000) throw new Error('POLL_INTERVAL_MS は 60000 以上で指定してください');
  let timer;
  let stopping = false;
  const cycle = async () => {
    try { await collect(store, config); await deliver(store); }
    catch (error) { console.error('同期失敗:', error.message); }
    if (!stopping) timer = setTimeout(cycle, interval);
  };
  server.listen(Number(process.env.PORT || 3001), '0.0.0.0', () => {
    console.log(`Ticket API started on port ${server.address().port}; sources=${config.sources.length}`);
    if (!config.sources.length) console.log('取得元未設定: server/sources.json に検証済み URL を設定してください');
    void cycle();
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopping = true; clearTimeout(timer); server.close(() => process.exit(0)); });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
