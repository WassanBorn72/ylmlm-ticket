import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractOfficialAnnouncements, enrichWithOfficialDetails, applyOfficialResult, collectOfficialDetails, extractOfficialSupplements } from '../src/tickets/official.mjs';
import { emptyState, feedFromState, parseState } from '../src/tickets/state.mjs';
const html = readFileSync(new URL('./fixtures/official-calendar.html', import.meta.url), 'utf8');
const notices = extractOfficialAnnouncements(html);
const snapshot = { status: 'ok', announcements: notices, checkedAt: '2026-10-12T00:00:00Z', lastSuccessAt: '2026-10-12T00:00:00Z', errors: [] };
const event = { id: 'a', date: '2026-10-31', title: 'Electrical Halloween Party', venue: '下北沢シャングリラ', offers: [], sourceUrls: ['https://livepocket.jp/e/wpw2g'] };
test('実際の公式カレンダー本文から出演・特典会と補足を抽出し、開場／開演と区別', () => {
 const detail = enrichWithOfficialDetails([event], snapshot)[0].officialDetails;
 assert.deepEqual(detail.performance, ['19:35-19:55']);
 assert.deepEqual(detail.meetAndGreet, ['20:30-22:00']);
 assert.deepEqual(detail.supplements, []);
 assert.equal(detail.url, 'https://ylmlm.jp/#schedule');
 const halloween = notices.find(n=>n.date==='2026-10-27');
 assert.deepEqual(halloween.performance, []);assert.deepEqual(halloween.meetAndGreet, []);
 assert.match(halloween.text,/ハロウィンの準備する権/);
});
test('短縮ドメインt-dvは購入先と照合し、同じURLでも別日には付与しない', () => {
 const e={...event,date:'2026-10-19',title:'異なる表記',sourceUrls:['https://ticketdive.com/event/20261019_night']};
 assert.deepEqual(enrichWithOfficialDetails([e],snapshot)[0].officialDetails.performance,['20:35-21:00']);
 assert.equal(enrichWithOfficialDetails([{...e,date:'2026-10-20'}],snapshot)[0].officialDetails,undefined);
});
test('タイトル部分一致や同日だけでは誤照合せず、複数部が曖昧なら付与しない', () => {
 assert.equal(enrichWithOfficialDetails([{...event,title:'別公演',sourceUrls:[]}],snapshot)[0].officialDetails,undefined);
 const two=enrichWithOfficialDetails([event,{...event,id:'b'}],snapshot);assert.ok(two.every(e=>!e.officialDetails));
});
test('公式情報の失敗は前回情報と取得日時を保持し、復旧後の削除は反映', () => {
 const failed=applyOfficialResult(snapshot,{status:'error',announcements:[],checkedAt:'2026-10-13T00:00:00Z',errors:['HTTP 403']});
 const detail=enrichWithOfficialDetails([event],failed)[0].officialDetails;assert.equal(detail.stale,true);assert.equal(detail.checkedAt,snapshot.checkedAt);
 const restored=applyOfficialResult(failed,{status:'ok',announcements:[],checkedAt:'2026-10-14T00:00:00Z',errors:[]});assert.equal(enrichWithOfficialDetails([event],restored)[0].officialDetails,undefined);
});
test('公式告知だけで新公演を一覧へ追加せず、再起動後も詳細を復元', () => {
 const state=emptyState();state.official=snapshot;
 const config={sources:[{id:'a',name:'A'}]};assert.deepEqual(feedFromState(state,config,'2026-10-12T00:00:00Z').events,[]);
 state.snapshots.a={events:[event],errors:[],status:'ok',checkedAt:snapshot.checkedAt};
 const restored=parseState(JSON.stringify(state));assert.equal(feedFromState(restored,config,'2026-10-12T00:00:00Z').events[0].officialDetails.performance[0],'19:35-19:55');
 assert.deepEqual(restored.unreadIds,[]);
});
test('公式HTML形式変更とHTTP失敗はチケット取得を妨げず公式情報のエラーになる', async () => {
 assert.throws(()=>extractOfficialAnnouncements('<p>Access denied</p>'),/形式/);
 const r=await collectOfficialDetails({fetchPage:async()=>{throw new Error('HTTP 403');}});assert.equal(r.status,'error');assert.deepEqual(r.announcements,[]);
 const c=new AbortController();c.abort();await assert.rejects(collectOfficialDetails({signal:c.signal,fetchPage:async()=>({html,url:'https://ylmlm.jp/'})}),/中断/);
});
test('不正な公式キャッシュはチケット保存データを壊さず除去する', () => {
 const state=emptyState();state.official={announcements:[{date:'2026-10-31'}],errors:[]};
 const restored=parseState(JSON.stringify(state));assert.equal(restored.official,undefined);assert.deepEqual(restored.snapshots,{});
});

test('共通案内・出演者一覧・料金と時間の重複を省き、固有の条件を原文で残す', () => {
 const text = `サンプル公演\n日程:2030年10月27日\n会場:新宿会場\n料金:前売 3500円 / 当日4000円 / 各D代別\n出演:ゆるめるモ! / 他のグループ\nライブ...19:00-19:30\n特典会...20:00-21:00\n最新の情報は公式サイトで確認してください。このイベントは再入場不可です。\n※予約のみ・当日支払い\n※撮影は指定エリアのみ可能です。\n※各チケット+1Drink\n💰絶対少女VIP¥6000/前方¥3000/一般¥1500/女性¥500 (各D代別🎫本日22:00〜予約受付開始\nチケットの購入はこちら https://ticketdive.com/event/a`;
 assert.deepEqual(extractOfficialSupplements(text,'サンプル公演','新宿会場'), ['このイベントは再入場不可です。','※予約のみ・当日支払い','※撮影は指定エリアのみ可能です。']);
});
test('券種ごとの特典は対象券種を保持し、イベント全体の仮装案内と混同しない', () => {
 const text=notices.find(n=>n.date==='2026-10-27').text;
 const lines=extractOfficialSupplements(text);
 assert.ok(lines.some(line=>line.startsWith('Sチケット：') && line.includes('19:00-19:30')));
 assert.ok(lines.some(line=>line.startsWith('Sチケット：') && line.includes('集合チェキ1枚')));
 assert.ok(lines.includes('この日は仮装しちゃいます👻'));
 assert.ok(!lines.some(line=>/8000|8,000|3500|3,500|OPEN|出演:/.test(line)));
});
test('注意事項の未知の文言と長い本文の末尾にある固有の条件を落とさない', () => {
 const text=`【注意事項】\nお申し込み時の番号で列を作ります。\n予めご了承ください。\n日時:2030年10月27日\n${'最新の情報は公式サイトで確認してください。\n'.repeat(150)}※10月3日のチケット持参で入場無料`;
 assert.deepEqual(extractOfficialSupplements(text),['お申し込み時の番号で列を作ります。','※10月3日のチケット持参で入場無料']);
});
