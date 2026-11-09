import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshStatus} from '../src/refreshStatus.mjs';
const result=(name,status,events=[])=>({name,status,events});
test('全サイト成功・該当公演ゼロはエラーにしない',()=>{
 assert.equal(refreshStatus([result('A','ok'),result('B','ok')]),null);
});
test('一部のサイトが失敗しても全体の更新失敗と表示しない',()=>{
 const value=refreshStatus([result('A','ok'),result('B','error')]);
 assert.equal(value.tone,'warning');assert.match(value.message,/取得できた情報を更新しました/);assert.match(value.message,/Bの情報/);
});
test('全サイトにエラーがあっても取得できた公演があれば部分取得と表示',()=>{
 assert.equal(refreshStatus([result('A','error',[{}]),result('B','error')]).tone,'warning');
});
test('全取得失敗は前回の公演一覧が表示されても失敗として知らせる',()=>{
 const value=refreshStatus([result('A','error'),result('B','error')]);
 assert.equal(value.tone,'error');assert.match(value.message,/情報を更新できませんでした/);
});
test('途中まで取得後の例外と取得前の例外を区別',()=>{
 assert.equal(refreshStatus([result('A','pending',[{}])],'通信エラー').tone,'warning');
 assert.equal(refreshStatus([],'通信エラー').tone,'error');
});
test('チケット成功・公式告知失敗は公式告知の注意として表示',()=>{
 const value=refreshStatus([result('チケット','ok'),result('公式告知','error')]);
 assert.equal(value.tone,'warning');assert.match(value.message,/公式告知/);
});
