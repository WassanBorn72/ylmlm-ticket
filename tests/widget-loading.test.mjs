import test from 'node:test';
import assert from 'node:assert/strict';
import {collectSource,collectTickets} from '../src/tickets/collector.mjs';
import {applyResults,emptyState,parseState} from '../src/tickets/state.mjs';
import {widgetSnapshot} from '../src/widget.mjs';
const source={id:'a',name:'A',allowedHosts:['tickets.example'],listingSelector:'main',listingReadySelector:'main',emptyPattern:'0件',eventPathPattern:'^/event/[a-z]+$'};
const config={artist:'ゆるめるモ！',targets:[{id:'member-6',name:'まこと',kind:'member'},{id:'unit-4',name:'なにQ',kind:'unit'}],sources:[source]};
const html=(title='公演',performer='ゆるめるモ！')=>`<script type="application/ld+json">${JSON.stringify({'@type':'Event',name:title,performer:{name:performer},startDate:'2030-02-01T18:00:00+09:00',location:{name:'会場'},offers:{price:1000}})}</script>`;
test('一覧・公演取得は同一ソース最大2通信で、URLを重複取得しない',async()=>{
 let active=0,peak=0;const calls=[];
 const result=await collectSource({...source,listingUrls:[1,2,3].map(i=>`https://tickets.example/search?q=${i}`)},config,async url=>{
  active++;peak=Math.max(peak,active);calls.push(url);await new Promise(resolve=>setImmediate(resolve));active--;
  return {url,html:url.includes('/search')?'<main><a href="/event/a">公演</a><a href="/event/b">公演</a><a href="/event/c">公演</a></main>':html(url)};
 });
 assert.equal(result.status,'ok');assert.equal(result.events.length,3);assert.equal(calls.length,6);assert.equal(peak,2);
});
test('公式告知の待機前に暫定表示し、新着の初期基準は最終結果で確定する',async()=>{
 let releaseOfficial,firstResult;const announced=new Promise(resolve=>{releaseOfficial=resolve;});const first=new Promise(resolve=>{firstResult=resolve;});const publications=[];const calls=[];
 const task=collectTickets({...config,sources:[{...source,eventUrls:['https://tickets.example/event/group']}]},{announcementsPromise:announced,onSource:r=>{publications.push(r);firstResult(r);},fetchPage:async url=>{calls.push(url);return {url,html:url.endsWith('/solo')?html('個人イベント','まこと'):html()};}});
 const preview=await first;assert.equal(preview.events.length,1);assert.equal(preview.status,'pending');
 const partial=applyResults(emptyState(),[preview],config,'2030-01-01T00:00:00Z');assert.equal(partial.snapshots.a.initialized,false);
 const recovered=parseState(JSON.stringify(partial));assert.equal(recovered.snapshots.a.status,'error');assert.equal(recovered.snapshots.a.initialized,false);
 releaseOfficial([{title:'まことソロイベント',date:'2030-02-01',ticketUrls:['tickets.example/event/solo']}]);
 const [final]=await task;assert.equal(final.status,'ok');assert.equal(final.events.length,2);assert.equal(calls.filter(url=>url.endsWith('/group')).length,1);
 const complete=applyResults(emptyState(),[final],config,'2030-01-01T00:00:00Z');assert.equal(complete.snapshots.a.initialized,true);assert.deepEqual(complete.unreadIds,[]);assert.equal(publications.length,2);
});
test('新しい公式告知から消えたキャッシュ済みURLを取得候補として再利用しない',async()=>{
 const calls=[];const results=await collectTickets({...config,sources:[{...source,listingUrls:['https://tickets.example/search']}]},{announcements:[{title:'なにQイベント',date:'2030-02-01',ticketUrls:['tickets.example/event/gone']}],announcementsPromise:Promise.resolve([]),fetchPage:async url=>{calls.push(url);return {url,html:'<main>0件</main>'};}});
 assert.equal(results[0].status,'ok');assert.equal(results[0].events.length,0);assert.deepEqual(calls,['https://tickets.example/search']);
});
test('ウィジェットに表示用データとお気に入りの引き継ぎ・更新時刻を渡す',()=>{
 const result=widgetSnapshot({events:[{id:'new',title:'公演',date:'2030-02-01',doorsAt:'2030-02-01T08:30:00Z',startAt:'2030-02-01T09:00:00Z',venue:'会場',staleSourceIds:['a']}],lastSyncAt:'2030-01-01T00:00:00Z'},['old'],{new:{favoriteId:'old'}});
 assert.equal(result.events[0].timeLabel,'OPEN 17:30 / START 18:00');assert.equal(result.events[0].mapQuery,'会場');assert.equal(result.events[0].favorite,true);assert.match(result.events[0].summary,/OPEN 17:30/);assert.match(result.updatedLabel,/一部前回情報/);assert.equal(result.events[0].id,'new');
 assert.equal(widgetSnapshot({events:[],lastSyncAt:null},[]).events.length,0);
});

test('一つの通信が残っている間に追加されたページ送りも、2件制限で最後まで取得する',async()=>{
 const visited=[];
 const result=await collectSource({...source,listingUrls:['https://tickets.example/search?q=a','https://tickets.example/search?q=b']},config,async url=>{
  visited.push(url);
  if(url.includes('q=a'))await new Promise(resolve=>setImmediate(resolve));
  const query=new URL(url);
  if(query.pathname==='/search'){
    if(query.searchParams.get('q')==='b')return{url,html:'<main>0件</main>'};
    const page=Number(query.searchParams.get('page')??1);
    return{url,html:`<main><a href="/event/${String.fromCharCode(96+page)}">公演</a>${page<5?`<a rel="next" href="?q=a&page=${page+1}">次</a>`:''}</main>`};
  }
  return{url,html:html(url)};
 });
 assert.equal(result.status,'ok');assert.equal(result.events.length,5);assert.equal(visited.filter(url=>url.includes('/event/')).length,5);assert.ok(visited.includes('https://tickets.example/search?q=a&page=5'));
});
test('同じ購入ページにグループと個人の別公演がある場合も、新しい公式告知で全公演を再照合する',async()=>{
 let publish;const first=new Promise(resolve=>{publish=resolve;});let release;const announced=new Promise(resolve=>{release=resolve;});let requests=0;
 const page=html('グループ公演')+html('個人公演','まこと').replace('2030-02-01','2030-02-02');
 const task=collectTickets({...config,sources:[{...source,eventUrls:['https://tickets.example/event/mixed']}]},{announcementsPromise:announced,onSource:publish,fetchPage:async url=>{requests++;return{url,html:page};}});
 const preview=await first;assert.equal(preview.events.length,1);
 release([{title:'まことソロイベント',date:'2030-02-02',ticketUrls:['tickets.example/event/mixed']}]);
 const [final]=await task;assert.equal(final.events.length,2);assert.equal(final.events.find(event=>event.title==='グループ公演').offers.length,1);assert.equal(requests,1);
});

test('ウィジェットには公式の出演・特典会時間を渡し、前回情報と複数の時間帯を保持する',()=>{
 const [e]=widgetSnapshot({events:[{id:'a',title:'公演',date:'2030-02-01',venue:'会場',doorsAt:'2030-02-01T08:30:00Z',officialDetails:{performance:['19:00〜19:25','19:00〜19:25','20:00〜20:25'],meetAndGreet:['19:35〜20:00'],stale:true}}],lastSyncAt:null},[]).events;
 assert.equal(e.timeLabel,'OPEN 17:30');
 assert.equal(e.performanceLabel,'出演（前回） 19:00〜19:25 / 20:00〜20:25');
 assert.equal(e.meetAndGreetLabel,'特典会（前回） 19:35〜20:00');
});
test('出演・特典会の情報がなければ開演時間から推測せず空欄にする',()=>{
 for(const officialDetails of [undefined,{performance:[],meetAndGreet:[]},{performance:['',' '],meetAndGreet:[]}]){
  const [e]=widgetSnapshot({events:[{id:'a',title:'公演',date:'2030-02-01',venue:'会場',startAt:'2030-02-01T09:00:00Z',officialDetails}],lastSyncAt:null},[]).events;
  assert.equal(e.performanceLabel,'');assert.equal(e.meetAndGreetLabel,'');
 }
});

test('ウィジェットに購入先と在庫の取得値・販売期間・前回取得フラグを渡す',()=>{
 const [e]=widgetSnapshot({events:[{id:'a',title:'公演',date:'2030-02-01',venue:'会場',offers:[{sourceId:'livepocket',sourceName:'LivePocket',availability:'InStock',salesStartAt:'2030-01-01T10:00:00+09:00',salesEndAt:'2030-01-02T10:00:00+09:00'}],staleSourceIds:['livepocket']}],lastSyncAt:null},[]).events;
 assert.deepEqual(e.ticketOffers,[{sourceId:'livepocket',sourceName:'LivePocket',availability:'InStock',salesStartMs:Date.parse('2030-01-01T01:00:00Z'),salesEndMs:Date.parse('2030-01-02T01:00:00Z'),stale:true}]);
 assert.deepEqual(widgetSnapshot({events:[{id:'a',title:'公演',date:'2030-02-01',venue:'会場'}],lastSyncAt:null},[]).events[0].ticketOffers,[]);
});

test('ウィジェットの地図検索は会場名と住所を使い、未掲載の会場名を検索しない',()=>{
 const events=widgetSnapshot({events:[{id:'a',title:'公演',date:'2030-02-01',venue:'渋谷ホール',address:'東京都渋谷区1-2-3'},{id:'b',title:'未定',date:'2030-02-01',venue:'会場は購入先で確認'}]},[]).events;
 assert.equal(events[0].mapQuery,'渋谷ホール 東京都渋谷区1-2-3');
 assert.equal(events[1].mapQuery,'');
 assert.equal(events[1].timeLabel,'時間未掲載');
});
