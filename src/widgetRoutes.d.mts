import type {TicketEvent} from './types';
export type WidgetRoute={kind:'event';data:Record<string,unknown>}|{kind:'list';tab:'favorites'|'tickets'};
export function parseWidgetRoute(url:string|null):WidgetRoute|null;
export function linkedEvent(events:TicketEvent[],data:Record<string,unknown>,changes?:Record<string,{favoriteId:string}>):TicketEvent|null;
export function subscribeWidgetRoutes(linking:{getInitialURL:()=>Promise<string|null>;addEventListener:(type:'url',listener:(event:{url:string})=>void)=>{remove:()=>void}},receive:(route:WidgetRoute)=>void):()=>void;
