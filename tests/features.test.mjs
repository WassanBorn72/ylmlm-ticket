import test from 'node:test';
import assert from 'node:assert/strict';
import {offerStatus, eventSalesStatus, parseAvailability, parseSalesPeriod} from '../src/tickets/sales.mjs';
import {calendarEvent} from '../src/calendarEvent.mjs';
import {applyResults, emptyState, parseState, feedFromState} from '../src/tickets/state.mjs';
import {extractSiteEvents} from '../src/tickets/adapters.mjs';
import {readFileSync} from 'node:fs';
const now='2030-01-01T00:00:00Z';
const config={artist:'ゆるめるモ！',sources:[{id:'a',name:'A'}]};
const event=(overrides={})=>({id:'one',title:'公演',date:'2030-02-01',startAt:'2030-02-01T09:00:00Z',doorsAt:'2030-02-01T08:30:00Z',venue:'会場',address:'住所',offers:[{sourceId:'a',sourceName:'A',label:'前売',price:1000,currency:'JPY',url:'https://example.com/1',availability:'InStock'}],sourceUrls:['https://example.com/1'],...overrides});
const result=(events,status='ok')=>({sourceId:'a',name:'A',events,status,errors:[],checkedAt:now});
test('販売状況は受付終了と完売を区別し、時刻を過ぎた期間と不明な情報を扱う',()=>{
 assert.equal(parseAvailability('販売終了'),'Discontinued');assert.equal(parseAvailability('完売'),'SoldOut');
 assert.equal(offerStatus({availability:'InStock',salesStartAt:'2030-02-01T00:00:00Z'},now),'販売前');
 assert.equal(offerStatus({availability:'InStock',salesEndAt:'2029-12-31T00:00:00Z'},now),'受付終了');
 assert.equal(offerStatus({},now),'購入先で確認');
 assert.equal(eventSalesStatus({offers:[{availability:'SoldOut'},{availability:'InStock'}]},now),'受付中の券種あり');
 assert.deepEqual(parseSalesPeriod('公演日時 2030/2/1 18:00〜2030/2/1 19:00'),{});
 const period=parseSalesPeriod('販売受付期間 2030年1月1日(火) 10:00〜2030年1月31日(木) 23:59');
 assert.equal(period.salesStartAt,'2030-01-01T01:00:00.000Z');assert.equal(period.salesEndAt,'2030-01-31T14:59:00.000Z');
});
test('LivePocket券種の受付終了と当該受付の期間を取得する',()=>{
 let html=readFileSync(new URL('./fixtures/livepocket-event.html',import.meta.url),'utf8');
 html=html.replace('販売中','受付終了').replace('<section class="event-detail-ticket-card">','<div class="event-detail-ticket__item"><div>販売受付期間 2026年10月1日(木) 22:00〜2026年10月11日(日) 23:59</div><section class="event-detail-ticket-card">').replace('</section>','</section></div>');
 const [e]=extractSiteEvents(html,'https://livepocket.jp/e/azi9-',{id:'livepocket',name:'LivePocket',adapter:'livepocket'},config);
 assert.equal(e.offers[0].availability,'Discontinued');assert.equal(e.offers[0].salesEndAt,'2026-10-11T14:59:00.000Z');
});
test('お気に入りだけに料金・販売状況の変更を保持し、失敗時と再取得で誤検出しない',()=>{
 const a=event();const b=event({offers:[{...a.offers[0],price:2000,availability:'SoldOut'}]});
 const initial=applyResults(emptyState(),[result([a])],config,now,['one']);
 assert.deepEqual(initial.favoriteChanges,{});
 const changed=applyResults(initial,[result([b])],config,now,['one']);
 assert.equal(changed.favoriteChanges.one.fields.length,2);
 const again=applyResults(parseState(JSON.stringify(changed)),[result([b])],config,now,['one']);
 assert.equal(again.favoriteChanges.one.fields.length,2);
 const failed=applyResults(again,[result([],'error')],config,now,['one']);assert.equal(failed.favoriteChanges.one.fields.length,2);
 assert.deepEqual(applyResults(initial,[result([b])],config,now,[]).favoriteChanges,{});
 const reverted=applyResults(changed,[result([a])],config,now,['one']);assert.equal(reverted.favoriteChanges.one.fields.length,0);
});
test('開演時間で公演IDが変わっても一意な同一ページならお気に入りと既読を引き継ぐ',()=>{
 const a=event();const b=event({id:'two',startAt:'2030-02-01T10:00:00Z'});
 const initial=applyResults(emptyState(),[result([a])],config,now,['one']);
 const changed=applyResults(initial,[result([b])],config,now,['one']);
 assert.equal(changed.favoriteChanges.two.favoriteId,'one');assert.equal(changed.favoriteChanges.two.fields[0].label,'A · 開演時間');
 assert.deepEqual(changed.unreadIds,[]);assert.equal(feedFromState(changed,config,now).events[0].isBaseline,true);
 const ambiguous=applyResults(initial,[result([b,event({id:'three',startAt:'2030-02-01T11:00:00Z'})])],config,now,['one']);assert.deepEqual(ambiguous.favoriteChanges,{});
});
test('欠損から判明した値と別サイトの追加は料金変更と扱わない',()=>{
 const a=event({offers:[{...event().offers[0],price:null,availability:null}]});
 const initial=applyResults(emptyState(),[result([a])],config,now,['one']);
 const changed=applyResults(initial,[result([event()])],config,now,['one']);assert.deepEqual(changed.favoriteChanges,{});
});
test('カレンダーにはJST・会場・購入先を渡し、終了未定と開始時刻未掲載を明記する',()=>{
 const timed=calendarEvent(event());assert.equal(timed.allDay,false);assert.equal(timed.startDate,'2030-02-01T08:30:00Z');assert.equal(timed.endDate,'2030-02-01T09:30:00.000Z');assert.ok(timed.notes.includes('仮に'));assert.ok(timed.notes.includes('https://example.com/1'));
 const allDay=calendarEvent(event({startAt:null,doorsAt:null}));assert.equal(allDay.allDay,true);assert.equal(allDay.startDate,'2030-02-01T00:00:00+09:00');assert.equal(allDay.timeZone,'Asia/Tokyo');
});

test('カレンダーのメモに取得済みの出演・特典会時間と補足を載せ、未掲載項目は省く',()=>{
 const e=event({officialDetails:{performance:['19:00〜19:30'],meetAndGreet:['19:40〜20:40'],supplements:['再入場不可','再入場不可'],checkedAt:'2030-01-01T00:00:00Z',stale:true},notes:[{sourceId:'a',text:'A：別途ドリンク代'}]});
 const data=calendarEvent(e);
 assert.match(data.notes,/【出演時間】\n19:00〜19:30/);
 assert.match(data.notes,/【特典会時間】\n19:40〜20:40/);
 assert.equal(data.notes.match(/再入場不可/g).length,1);
 assert.match(data.notes,/A：別途ドリンク代/);
 assert.match(data.notes,/前回取得/);
 assert.match(data.notes,/公式情報の確認日時/);
 assert.match(data.notes,/【購入先】\nhttps:\/\/example.com\/1/);
 assert.equal(data.startDate,e.doorsAt);assert.match(data.notes,/START（開演）：18:00/);
 const empty=calendarEvent(event({officialDetails:{performance:[],meetAndGreet:[],supplements:[],stale:false}}));
 assert.doesNotMatch(empty.notes,/【出演時間】|【特典会時間】|【補足】|undefined|Invalid Date/);
});


test('カレンダーは開場を優先し、開場不明なら開演、開演不明でも開場だけで予定を作る',()=>{
 const onlyStart=calendarEvent(event({doorsAt:null}));assert.equal(onlyStart.startDate,event().startAt);assert.match(onlyStart.notes,/START（開演）/);
 const onlyDoors=calendarEvent(event({startAt:null}));assert.equal(onlyDoors.allDay,false);assert.equal(onlyDoors.startDate,event().doorsAt);assert.match(onlyDoors.notes,/OPEN（開場）/);
});
