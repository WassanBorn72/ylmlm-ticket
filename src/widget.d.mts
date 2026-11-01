import type {Feed} from './types';
export function widgetSnapshot(feed:Feed,favoriteIds:string[],favoriteChanges?:Record<string,{favoriteId:string}>):{events:{id:string;title:string;date:string;sortTime:string;favorite:boolean;timeLabel:string;venueLabel:string;summary:string}[];updatedLabel:string;updatedShort:string};
