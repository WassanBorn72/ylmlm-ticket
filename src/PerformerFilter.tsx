import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import config from './tickets/sources.json';
import { performerLabel } from './performers';
type Props = { visible: boolean; selectedId: string | null; onSelect: (id: string | null) => void; onClose: () => void };
export default function PerformerFilter({ visible, selectedId, onSelect, onClose }: Props) {
  const choose = (id: string | null) => { onSelect(id); onClose(); };
  const option = (id: string | null, name: string) => <Pressable key={id ?? 'all'} style={[s.option, selectedId === id && s.selected]} onPress={() => choose(id)} accessibilityRole="button" accessibilityLabel={`${name}で絞り込む`} accessibilityState={{ selected: selectedId === id }}><Text style={s.text}>{name}{selectedId === id ? ' ✓' : ''}</Text></Pressable>;
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={s.backdrop}>
    <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} accessibilityRole="button" accessibilityLabel="出演者選択を閉じる" />
    <SafeAreaView edges={['bottom']} style={s.sheet}><ScrollView contentContainerStyle={s.content}>
      <Text style={s.title}>出演者を選ぶ</Text>
      <Text style={s.note}>掲載情報に出演が明記された公演を表示します。個人を選んでも、参加ユニットの公演は自動で含めません。</Text>
      {option(null, 'すべての出演者')}
      <Text style={s.heading}>グループ</Text>{option('group', config.artist)}
      {([['member', '個人'], ['unit', 'グループ内ユニット'], ['collaboration', '外部コラボ']] as const).map(([kind, label]) => <View key={kind}><Text style={s.heading}>{label}</Text>{config.targets.filter(artist => artist.kind === kind).map(artist => option(artist.id, performerLabel(artist, false)))}</View>)}
      <Pressable style={s.option} onPress={onClose} accessibilityRole="button" accessibilityLabel="出演者選択を閉じる"><Text style={s.text}>閉じる</Text></Pressable>
    </ScrollView></SafeAreaView>
  </View></Modal>;
}
const s = StyleSheet.create({backdrop:{flex:1,backgroundColor:'#0005',justifyContent:'flex-end'},sheet:{backgroundColor:'#f8faf8',borderTopLeftRadius:24,borderTopRightRadius:24,maxHeight:'85%'},content:{padding:20,gap:8},title:{fontSize:22,fontWeight:'700',color:'#243c32'},heading:{fontSize:15,fontWeight:'700',color:'#287b59',marginTop:16,marginBottom:6},note:{fontSize:13,lineHeight:21,color:'#65746d'},option:{minHeight:48,padding:12,borderRadius:12,justifyContent:'center'},selected:{backgroundColor:'#e4f2e9'},text:{fontSize:16,color:'#243c32'}});
