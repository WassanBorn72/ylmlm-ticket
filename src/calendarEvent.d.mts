import type { TicketEvent } from './types';
export function calendarEvent(event: TicketEvent): {title: string; startDate: string; endDate: string; allDay: boolean; timeZone: string; location: string; notes: string; url?: string};
