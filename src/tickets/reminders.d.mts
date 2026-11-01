import type { TicketEvent } from '../types';
export const REMINDER_KIND: string;
export const REMINDER_LIMIT: number;
export type SaleReminder = {id:string;eventId:string;title:string;body:string;date:string;eventDate:string;eventTitle:string;url:string;stale:boolean;signature:string};
export function saleReminders(events: TicketEvent[],favoriteIds:string[],favoriteChanges?:Record<string,{favoriteId:string}>,now?:string):SaleReminder[];
export function reconcileReminders(api:{list:()=>Promise<{identifier:string;content:{data?:Record<string,unknown>}}[]>;cancel:(id:string)=>Promise<void>;schedule:(item:SaleReminder)=>Promise<unknown>},desired:SaleReminder[],isCurrent?:()=>boolean):Promise<string[]>;
