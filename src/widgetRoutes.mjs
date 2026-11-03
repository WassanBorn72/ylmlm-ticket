// Widget routes are identifiers for local event details, never arbitrary URLs to open.
export function parseWidgetRoute(url) {
  try {
    const target=new URL(url);
    if(target.protocol!=='ylmlm-unofficial-ticket:'||target.username||target.password||target.port)return null;
    if(target.hostname==='event') {
      const id=decodeURIComponent(target.pathname.slice(1));
      if(!/^[a-zA-Z0-9_-]{1,128}$/.test(id))return null;
      const eventDate=target.searchParams.get('date');
      const eventTitle=target.searchParams.get('title');
      const sourceUrl=target.searchParams.get('url');
      return {kind:'event',data:{eventId:id,origin:'widget',...(/^\d{4}-\d{2}-\d{2}$/.test(eventDate??'')?{eventDate}:{}),...(eventTitle&&eventTitle.length<=1024?{eventTitle}:{}),...(sourceUrl?.startsWith('https://')?{url:sourceUrl}:{})}};
    }
    if(['favorites','tickets'].includes(target.hostname)&&['','/'].includes(target.pathname))return {kind:'list',tab:target.hostname};
  }catch{/* Malformed or unrelated links must not change the current screen. */}
  return null;
}
export function linkedEvent(events,data,changes={}) {
  const exact=events.filter(event=>event.id===data.eventId);
  if(exact.length)return exact.length===1?exact[0]:null;
  const aliases=events.filter(event=>changes[event.id]?.favoriteId===data.eventId);
  if(aliases.length)return aliases.length===1?aliases[0]:null;
  if(typeof data.eventDate!=='string'||typeof data.eventTitle!=='string')return null;
  if(typeof data.url!=='string'&&data.origin!=='widget')return null;
  const matches=events.filter(event=>event.date===data.eventDate&&event.title===data.eventTitle&&(typeof data.url!=='string'||event.sourceUrls.includes(data.url)));
  return matches.length===1?matches[0]:null;
}
export function subscribeWidgetRoutes(linking,receive) {
  let active=true,liveRouteReceived=false;
  const subscription=linking.addEventListener('url',event=>{
    const route=parseWidgetRoute(event.url);
    if(active&&route){liveRouteReceived=true;receive(route);}
  });
  void Promise.resolve().then(()=>linking.getInitialURL()).then(url=>{
    const route=parseWidgetRoute(url);
    if(active&&!liveRouteReceived&&route)receive(route);
  }).catch(()=>{});
  return()=>{active=false;subscription.remove();};
}
