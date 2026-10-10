import { resolve } from 'node:path';
import { Store } from './store.mjs';
import { readConfig, collect } from './collector.mjs';

// 同じ DATA_DIR を使う常駐サーバーを停止してから実行してください。
const config = readConfig(resolve(process.env.SOURCE_CONFIG || 'server/sources.json'));
const store = new Store(resolve(process.env.DATA_DIR || 'server/data'));
await collect(store, config);
console.log(JSON.stringify({ sources: store.state.sourceStatus, eventCount: Object.keys(store.state.events).length }, null, 2));
if (!config.sources.length || Object.values(store.state.sourceStatus).some(source => source.status !== 'ok')) process.exitCode = 1;
