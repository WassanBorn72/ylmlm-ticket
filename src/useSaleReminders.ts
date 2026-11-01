import {useEffect, useMemo, useRef, useState} from 'react';
import {AppState, Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import {TicketEvent} from './types';
import {REMINDER_KIND, REMINDER_LIMIT, reconcileReminders, saleReminders, SaleReminder} from './tickets/reminders.mjs';
const key = 'yuruticket-sale-reminders-v1';
const channelId = 'ticket-sales';
if (Platform.OS !== 'web') Notifications.setNotificationHandler({handleNotification:async()=>({shouldShowBanner:true,shouldShowList:true,shouldPlaySound:true,shouldSetBadge:false})});
const allowed = (permission: Notifications.NotificationPermissionsStatus) => permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
const nativeApi = {
  list: () => Notifications.getAllScheduledNotificationsAsync(),
  cancel: (id:string) => Notifications.cancelScheduledNotificationAsync(id),
  schedule: (item:SaleReminder) => Notifications.scheduleNotificationAsync({
    identifier:item.id,
    content:{title:item.title,body:item.body,sound:'default',data:{kind:REMINDER_KIND,signature:item.signature,eventId:item.eventId,eventDate:item.eventDate,eventTitle:item.eventTitle,url:item.url}},
    trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date:new Date(item.date),channelId},
  }),
};
export function useSaleReminders(events:TicketEvent[],favoriteIds:string[],favoriteChanges:Record<string,{favoriteId:string}>|undefined,onOpen:(data:Record<string,unknown>)=>void,dataReady=true) {
  const supported = Platform.OS !== 'web';
  const [enabled,setEnabled] = useState(false);
  const [ready,setReady] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [denied,setDenied] = useState(false);
  const [scheduledIds,setScheduledIds] = useState<string[]>([]);
  const [revision,setRevision] = useState(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const generation = useRef(0);
  const opening = useRef(false);
  const latestOpen = useRef(onOpen);latestOpen.current=onOpen;
  const plan = useMemo(()=>saleReminders(events,favoriteIds,favoriteChanges),[events,favoriteIds,favoriteChanges,revision,enabled]);
  useEffect(()=>{
    let mounted=true;
    AsyncStorage.getItem(key).then(value=>{if(mounted)setEnabled(value==='true');}).catch(()=>{if(mounted)setError('通知設定を読み込めませんでした。');}).finally(()=>{if(mounted)setReady(true);});
    return()=>{mounted=false;generation.current++;};
  },[]);
  useEffect(()=>{
    if(!supported)return;
    const response=(value:Notifications.NotificationResponse|null)=>{
      const data=value?.notification.request.content.data;
      if(data?.kind===REMINDER_KIND){latestOpen.current(data);Notifications.clearLastNotificationResponse();}
    };
    response(Notifications.getLastNotificationResponse());
    const sub=Notifications.addNotificationResponseReceivedListener(response);
    const state=AppState.addEventListener('change',value=>{if(value==='active')setRevision(v=>v+1);});
    return()=>{sub.remove();state.remove();};
  },[supported]);
  useEffect(()=>{
    if(!ready||!supported||!dataReady)return;
    const token=++generation.current;
    const current=()=>token===generation.current;
    queue.current=queue.current.catch(()=>{}).then(async()=>{
      if(!current())return;
      setBusy(true);
      try{
        const permission=await Notifications.getPermissionsAsync();
        if(!current())return;
        const canNotify=allowed(permission);setDenied(enabled&&!canNotify);
        if(enabled&&canNotify&&Platform.OS==='android')await Notifications.setNotificationChannelAsync(channelId,{name:'チケット発売開始',importance:Notifications.AndroidImportance.HIGH,sound:'default',enableVibrate:false});
        const preserved=enabled&&canNotify?events.filter(event=>event.staleSourceIds?.length&&(favoriteIds.includes(event.id)||favoriteIds.includes(favoriteChanges?.[event.id]?.favoriteId??''))).flatMap(event=>[event.id,favoriteChanges?.[event.id]?.favoriteId??'']):[];
        const ids=await reconcileReminders(nativeApi,enabled&&canNotify?plan:[],current,preserved);
        if(current()){setScheduledIds(ids);setError('');}
      }catch{if(current())setError('発売開始リマインダーを予約できませんでした。通知設定を確認して再試行してください。');}
      finally{if(current())setBusy(false);}
    });
    return()=>{if(current())generation.current++;};
  },[ready,supported,enabled,plan,revision,dataReady]);
  const toggle=async()=>{
    if(!ready||!supported||!dataReady||opening.current)return;
    opening.current=true;setBusy(true);setError('');
    try{
      if(!enabled){
        if(Platform.OS==='android')await Notifications.setNotificationChannelAsync(channelId,{name:'チケット発売開始',importance:Notifications.AndroidImportance.HIGH,sound:'default',enableVibrate:false});
        let permission=await Notifications.getPermissionsAsync();
        if(!allowed(permission))permission=await Notifications.requestPermissionsAsync();
        if(!allowed(permission)){setDenied(true);setError('端末の通知設定で許可してください。');return;}
      }
      await AsyncStorage.setItem(key,JSON.stringify(!enabled));setEnabled(!enabled);setDenied(false);
    }catch{setError('通知設定を保存できませんでした。');}
    finally{opening.current=false;setBusy(false);}
  };
  return {enabled,ready:ready&&dataReady,supported,busy,error,denied,scheduledIds,toggle,retry:()=>setRevision(v=>v+1),limit:REMINDER_LIMIT,eligibleCount:plan.length};
}
