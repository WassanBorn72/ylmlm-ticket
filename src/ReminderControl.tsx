import React from 'react';
import {Pressable, StyleSheet, Switch, Text, View} from 'react-native';
import {Bell} from 'lucide-react-native';
type Props={enabled:boolean;busy:boolean;disabled:boolean;onToggle:()=>void;label?:string};
export default function ReminderControl({enabled,busy,disabled,onToggle,label='お気に入りの発売開始リマインダー'}:Props){
  return <Pressable style={({pressed})=>[s.control,enabled&&s.on,pressed&&!disabled&&s.pressed]} disabled={disabled} onPress={onToggle} accessibilityRole="switch" accessibilityLabel={label} accessibilityHint="お気に入り公演に共通する発売開始通知の設定" accessibilityState={{checked:enabled,disabled,busy}}>
    <Bell size={24} color="#287b59"/>
    <View style={s.labels}><Text style={s.title}>発売開始通知</Text><Text style={s.state}>{busy?'設定中…':enabled?'オン':'オフ'}</Text></View>
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Switch accessible={false} value={enabled} disabled={disabled} trackColor={{false:'#b7c4bd',true:'#287b59'}} thumbColor="white"/></View>
  </Pressable>;
}
const s=StyleSheet.create({control:{minHeight:68,padding:14,marginVertical:8,flexDirection:'row',alignItems:'center',gap:12,borderWidth:1,borderColor:'#cbded1',borderRadius:14,backgroundColor:'white'},on:{backgroundColor:'#e7f4ec'},pressed:{opacity:0.75},labels:{flex:1},title:{fontSize:16,fontWeight:'700',color:'#243c32'},state:{fontSize:13,color:'#50685c',marginTop:4}});
