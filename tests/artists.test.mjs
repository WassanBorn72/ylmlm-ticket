import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchingArtists, officialArtistHints } from '../src/tickets/artists.mjs';
import { normalizeEvents } from '../src/tickets/extract.mjs';
import { collectTickets } from '../src/tickets/collector.mjs';
const config=JSON.parse(readFileSync(new URL('../src/tickets/sources.json',import.meta.url),'utf8'));
test('4ユニットのグループ名がない出演を照合し、6メンバーは所属を確認して照合',()=>{
 for(const target of config.targets.filter(a=>a.kind==='unit'))assert.ok(matchingArtists('単独イベント',target.name,'',config).some(a=>a.id===target.id));
 for(const target of config.targets.filter(a=>a.kind==='member')){
  assert.ok(matchingArtists('単独イベント',`${target.name}(ゆるめるモ！)`,'',config).some(a=>a.id===target.id));
  assert.deepEqual(matchingArtists('関係ない公演',target.name,'',config),[]);
 }
 assert.deepEqual(matchingArtists('なにか面白いもの、らき☆すた、へその話','別の出演者','',config),[]);
});
test('公式カレンダーの購入先と日付が一致すれば所属表記がない個人出演も取り込む',()=>{
 const hints=officialArtistHints([{title:'ねるん生誕イベント',date:'2030-11-03',ticketUrls:['tiget.net/events/123']}],config);
 const source={id:'tiget',name:'TIGET',allowedHosts:['tiget.net']};
 const data={name:'トークイベント',performer:{name:'ねるん'},startDate:'2030-11-03',location:{name:'会場'}};
 assert.equal(normalizeEvents([data],'https://tiget.net/events/123',source,config).length,0);
 const [event]=normalizeEvents([data],'https://tiget.net/events/123',source,{...config,officialHints:hints});assert.ok(event.artists.some(a=>a.name==='ねるん'));
 assert.equal(normalizeEvents([{...data,startDate:'2030-11-04'}],'https://tiget.net/events/123',source,{...config,officialHints:hints}).length,0);
 assert.ok(officialArtistHints([{title:'なにぬねるんの公演',date:'2030-11-03',ticketUrls:['tiget.net/events/123']}],config).every(h=>!h.artists.some(a=>a.name==='なに')));
});
test('6件以上の独立検索を巡回し、同一公演URLは一度だけ取得',async()=>{
 const listings=Array.from({length:11},(_,i)=>`https://tickets.example/search?q=${i}`);
 const source={id:'a',name:'A',allowedHosts:['tickets.example'],listingUrls:listings,listingSelector:'main',listingReadySelector:'main',eventPathPattern:'^/events/1$',emptyPattern:'0件'};
 const calls=[];const results=await collectTickets({...config,sources:[source]},{fetchPage:async url=>{
  calls.push(url);return {url,html:url.includes('/search')?'<main><a href="/events/1">公演</a></main>':`<script type="application/ld+json">${JSON.stringify({'@type':'Event',name:'単独公演',performer:{name:'なにQ'},startDate:'2030-11-03',location:{name:'会場'}})}</script>`};
 }});assert.equal(results[0].status,'ok');assert.equal(results[0].events.length,1);assert.equal(calls.length,12);
});
test('絵文字や括弧を含む個人告知を扱い、短い名前が一般文の一部なら照合しない',()=>{
 const hints=officialArtistHints([{title:'💙めありプロデュースライブ',date:'2030-11-03',ticketUrls:['tiget.net/events/123']},{title:'なにか楽しい企画',date:'2030-11-03',ticketUrls:['tiget.net/events/999']}],config);
 assert.deepEqual(hints.map(h=>h.artists.find(a=>a.kind==='member')?.name),['めあり']);
});
test('TicketDiveの検証したSSR該当なしは成功、別検索のデータは失敗にする',async()=>{
 const source={id:'ticketdive',adapter:'ticketdive',name:'TD',allowedHosts:['tickets.example'],listingUrls:['https://tickets.example/search?q=unit'],listingReadySelector:'main',listingSelector:'main',eventPathPattern:'^/events/1$'};
 for (const valid of [true,false]) {
  const result=await collectTickets({...config,sources:[source]},{fetchPage:async url=>({url,html:`<main></main><script id="__NEXT_DATA__">${JSON.stringify({page:'/search',props:{pageProps:{__superjsonProps:{json:{searchQuery:valid?'unit':'other',eventList:[]}}}}})}</script>`})});
  assert.equal(result[0].status,valid?'ok':'error');
 }
});

test('グループ告知だけでは掲載一覧から消えた公演を再追加しない',()=>{
 assert.deepEqual(officialArtistHints([{title:'ゆるめるモ！ハロウィーン',date:'2030-11-03',ticketUrls:['ticketdive.com/event/abc']}],config),[]);
});

test('グループと同じ対バンに同名の別人がいてもメンバーとして付与しない',()=>{
 const artists=matchingArtists('対バン公演','ゆるめるモ！ / まこと','',config);
 assert.ok(artists.some(a=>a.kind==='group'));assert.ok(!artists.some(a=>a.name==='まこと'));
});

test('外部コラボの別表記を照合し、個人出演を推測で追加しない', () => {
 for (const name of ['桃組暴想族', 'Babywiper or Gangster', 'Babywiper or Gangstar']) {
  const artists = matchingArtists('コラボ公演', name, '', config);
  assert.equal(artists.length, 1);
  assert.equal(artists[0].kind, 'collaboration');
  assert.ok(officialArtistHints([{title:name,date:'2030-11-03',ticketUrls:['tiget.net/events/123']}], config)[0].artists.some(a=>a.kind==='collaboration'));
 }
});
