import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWidgetRoute,linkedEvent,subscribeWidgetRoutes} from '../src/widgetRoutes.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const event={id:'new-id',title:'公演！',date:'2030-11-03',sourceUrls:['https://tiget.net/events/123']};
test('ウィジェットの公演リンクからID・日付・公演名・購入先を復元する',()=>{
 const url=`ylmlm-unofficial-ticket://event/old-id?${new URLSearchParams({date:event.date,title:event.title,url:event.sourceUrls[0]})}`;
 const route=parseWidgetRoute(url);assert.equal(route.kind,'event');assert.equal(route.data.eventId,'old-id');assert.equal(route.data.eventTitle,event.title);
 assert.equal(linkedEvent([event],route.data),event);
 assert.equal(linkedEvent([event],{eventId:event.id}),event);
 assert.equal(linkedEvent([event],{eventId:'favorite-old'}, {[event.id]:{favoriteId:'favorite-old'}}),event);
});
test('曖昧な公演を勝手に開かず、既存の通知からの公演照合も維持する',()=>{
 const data={eventId:'old-id',eventDate:event.date,eventTitle:event.title,url:event.sourceUrls[0]};
 assert.equal(linkedEvent([event],data),event);
 assert.equal(linkedEvent([event,{...event,id:'other-id'}],data),null);
 assert.equal(linkedEvent([event],{...data,url:'https://tiget.net/events/other'}),null);
 assert.equal(linkedEvent([event],{eventId:'unknown'}),null);
 assert.equal(linkedEvent([],{eventId:event.id}),null);
});
test('一覧リンクと不正なリンクを区別し、外部URLで画面を切り替えない',()=>{
 assert.deepEqual(parseWidgetRoute('ylmlm-unofficial-ticket://favorites'),{kind:'list',tab:'favorites'});
 assert.deepEqual(parseWidgetRoute('ylmlm-unofficial-ticket://tickets'),{kind:'list',tab:'tickets'});
 for(const bad of [null,'https://event/new-id','ylmlm-unofficial-ticket://event/','ylmlm-unofficial-ticket://event/%2fetc','ylmlm-unofficial-ticket://event/%zz','ylmlm-unofficial-ticket://user@event/new-id','ylmlm-unofficial-ticket://favorites/other'])assert.equal(parseWidgetRoute(bad),null);
});
test('アプリの初回起動リンクと、起動中の追加タップを同じ購読で受け取る',async()=>{
 let listener,removed=false;const routes=[];
 const stop=subscribeWidgetRoutes({getInitialURL:async()=>`ylmlm-unofficial-ticket://event/${event.id}`,addEventListener:(type,fn)=>{assert.equal(type,'url');listener=fn;return{remove:()=>{removed=true;}};}},r=>routes.push(r));
 await tick();assert.equal(routes[0].data.eventId,event.id);
 listener({url:'ylmlm-unofficial-ticket://event/second'});assert.equal(routes[1].data.eventId,'second');
 stop();listener({url:'ylmlm-unofficial-ticket://event/ignored'});assert.equal(routes.length,2);assert.equal(removed,true);
});
test('初回リンクの取得待ち中に別公演をタップしても、古い初回リンクで上書きしない',async()=>{
 let resolveInitial,listener;const routes=[];
 const stop=subscribeWidgetRoutes({getInitialURL:()=>new Promise(r=>{resolveInitial=r;}),addEventListener:(_,fn)=>{listener=fn;return{remove(){}};}},r=>routes.push(r));
 await tick();listener({url:'ylmlm-unofficial-ticket://event/latest'});resolveInitial('ylmlm-unofficial-ticket://event/old');await tick();
 assert.deepEqual(routes.map(r=>r.data.eventId),['latest']);stop();
});
test('起動直後に購読が解除された場合は、遅れて取得したリンクで詳細を開かない',async()=>{
 let resolveInitial;const routes=[];
 const stop=subscribeWidgetRoutes({getInitialURL:()=>new Promise(r=>{resolveInitial=r;}),addEventListener:()=>({remove(){}})},r=>routes.push(r));
 await tick();stop();resolveInitial('ylmlm-unofficial-ticket://event/old');await tick();assert.deepEqual(routes,[]);
});
