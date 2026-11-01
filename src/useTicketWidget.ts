import {useEffect,useRef,useState} from 'react';
import {Platform} from 'react-native';
import {requireOptionalNativeModule} from 'expo';
import {Feed} from './types';
import {widgetSnapshot} from './widget.mjs';
const native=Platform.OS==='android'?requireOptionalNativeModule<{updateSnapshot:(value:string)=>Promise<void>;requestPin:(favorites:boolean)=>Promise<boolean>}>('TicketWidget'):null;
export function useTicketWidget(feed:Feed,favoriteIds:string[],changes:Record<string,{favoriteId:string}>|undefined,ready:boolean){
  const [error,setError]=useState('');const queue=useRef<Promise<void>>(Promise.resolve());
  useEffect(()=>{
    if(!native||!ready)return;
    const payload=JSON.stringify(widgetSnapshot(feed,favoriteIds,changes));let current=true;
    queue.current=queue.current.catch(()=>{}).then(async()=>{if(!current)return;await native.updateSnapshot(payload);if(current)setError('');}).catch(()=>{if(current)setError('ウィジェットを更新できませんでした。');});
    return()=>{current=false;};
  },[feed,favoriteIds,changes,ready]);
  return {supported:!!native,error,add:async(favorites:boolean)=>native?native.requestPin(favorites):false};
}
