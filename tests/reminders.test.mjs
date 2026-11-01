import test from 'node:test';
import assert from 'node:assert/strict';
import {saleReminders,reconcileReminders,REMINDER_KIND,REMINDER_LIMIT} from '../src/tickets/reminders.mjs';
const now='2030-01-01T00:00:00Z';
const offer=(overrides={})=>({sourceId:'a',sourceName:'A',label:'前売',url:'https://example.com/1',availability:'PreOrder',salesStartAt:'2030-01-02T10:00:00+09:00',...overrides});
const event=(overrides={})=>({id:'one',title:'公演',date:'2030-02-01',offers:[offer()],sourceUrls:['https://example.com/1'],...overrides});
const request=item=>({identifier:item.id,content:{data:{kind:REMINDER_KIND,signature:item.signature}}});
const fake=(initial=[])=>{
 const store=new Map(initial.map(item=>[item.identifier,item]));const calls=[];
 return {calls,store,list:async()=>[...store.values()],cancel:async id=>{calls.push(['cancel',id]);store.delete(id);},schedule:async item=>{calls.push(['schedule',item.id]);store.set(item.id,request(item));}};
};
test('お気に入りの既知の未来の発売時刻のみを選び、同一公演・同時刻をまとめる',()=>{
 const events=[event({offers:[offer(),offer({label:'優先'}),offer({sourceId:'b',sourceName:'B'})]}),event({id:'other'})];
 const plan=saleReminders(events,['one'],{},now);assert.equal(plan.length,1);assert.match(plan[0].body,/前売/);assert.match(plan[0].body,/優先/);assert.equal(plan[0].date,'2030-01-02T01:00:00.000Z');
 for(const value of [null,'bad','2029-12-31T00:00:00Z',now])assert.equal(saleReminders([event({offers:[offer({salesStartAt:value})]})],['one'],{},now).length,0);
 for(const availability of ['SoldOut','Discontinued','OutOfStock'])assert.equal(saleReminders([event({offers:[offer({availability})]})],['one'],{},now).length,0);
});
test('同じ予約を繰り返さず、日時変更は古い通知を取り消して予約し直す',async()=>{
 const api=fake();const plan=saleReminders([event()],['one'],{},now);
 await reconcileReminders(api,plan);await reconcileReminders(api,plan);assert.equal(api.calls.length,1);
 const changed=saleReminders([event({offers:[offer({salesStartAt:'2030-01-03T01:00:00Z'})]})],['one'],{},now);
 await reconcileReminders(api,changed);assert.equal(api.calls[1][0],'cancel');assert.equal(api.calls[2][0],'schedule');assert.equal(api.store.size,1);
});
test('通知オフ・お気に入り解除は独自予約だけを削除し、他の通知を残す',async()=>{
 const plan=saleReminders([event()],['one'],{},now);const foreign={identifier:'other',content:{data:{kind:'other'}}};const api=fake([request(plan[0]),foreign]);
 await reconcileReminders(api,saleReminders([event()],[],{},now));assert.deepEqual([...api.store.keys()],['other']);
});
test('取得失敗の既存予約は保持し、古い情報から新しい予約は作らない',async()=>{
 const plan=saleReminders([event()],['one'],{},now);const stale=saleReminders([event({staleSourceIds:['a']})],['one'],{},now);
 const existing=fake([request(plan[0])]);await reconcileReminders(existing,stale);assert.equal(existing.calls.length,0);
 const empty=fake();await reconcileReminders(empty,stale);assert.equal(empty.calls.length,0);
});
test('近い順に50件まで予約し、お気に入りIDの引き継ぎを認識する',async()=>{
 const events=Array.from({length:60},(_,i)=>event({id:`event-${i}`,offers:[offer({salesStartAt:new Date(Date.parse(now)+(60-i)*3600000).toISOString()})]}));
 const plan=saleReminders(events,events.map(e=>e.id),{},now);assert.ok(plan[0].date<plan[59].date);
 const api=fake();await reconcileReminders(api,plan);assert.equal(api.store.size,REMINDER_LIMIT);
 const alias=saleReminders([event({id:'new'})],['old'],{new:{favoriteId:'old'}},now);assert.equal(alias.length,1);
});
