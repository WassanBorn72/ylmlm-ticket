import type { Offer, TicketEvent } from '../types';
export function parseAvailability(value: string): string | null;
export function parseSalesPeriod(value: string): {salesStartAt?: string | null; salesEndAt?: string | null};
export function salesDates(offer: Partial<Offer>): {salesStartAt: string | null; salesEndAt: string | null};
export function offerStatus(offer: Partial<Offer>, now?: string): string;
export function eventSalesStatus(event: TicketEvent, now?: string): string;
