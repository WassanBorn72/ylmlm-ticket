import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { calendarDays, shiftMonth } from './calendar.mjs';

type Props = { visible: boolean; dates: string[]; selectedDate: string | null; onSelect: (date: string | null) => void; onClose: () => void };
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export default function DateFilter({ visible, dates, selectedDate, onSelect, onClose }: Props) {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  useEffect(() => {
    if (visible) setMonth((selectedDate || dates[0] || today()).slice(0, 7));
    // Initialize when opening; background refreshes must not move a calendar being browsed.
  }, [visible]);
  const choose = (date: string | null) => { onSelect(date); onClose(); };
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={s.backdrop}>
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} accessibilityRole="button" accessibilityLabel="日付選択を閉じる" />
      <SafeAreaView edges={['bottom']} style={s.sheet}>
        <ScrollView>
          <View style={s.between}><Text style={s.title}>開催日を選ぶ</Text><Pressable style={s.iconButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="カレンダーを閉じる"><X size={22} color="#243c32" /></Pressable></View>
          <View style={s.between}>
            <Pressable style={s.iconButton} onPress={() => setMonth(shiftMonth(month, -1))} accessibilityRole="button" accessibilityLabel="前の月"><ChevronLeft size={22} color="#287b59" /></Pressable>
            <Text style={s.month}>{Number(month.slice(0, 4))}年{Number(month.slice(5))}月</Text>
            <Pressable style={s.iconButton} onPress={() => setMonth(shiftMonth(month, 1))} accessibilityRole="button" accessibilityLabel="次の月"><ChevronRight size={22} color="#287b59" /></Pressable>
          </View>
          <View style={s.grid}>{['日', '月', '火', '水', '木', '金', '土'].map((day, index) => <Text key={day} style={[s.weekday, index === 0 && s.sunday, index === 6 && s.saturday]}>{day}</Text>)}</View>
          <View style={s.grid}>{calendarDays(month).map((date, index) => date ? <Pressable key={date} style={s.cell} onPress={() => choose(date)} accessibilityRole="button" accessibilityLabel={`${date}の公演で絞り込む${dates.includes(date) ? '・公演あり' : ''}`} accessibilityState={{ selected: selectedDate === date }}>
            <View style={[s.day, selectedDate === date && s.selected]}><Text style={[s.dayText, index % 7 === 0 && s.sunday, index % 7 === 6 && s.saturday, selectedDate === date && s.selectedText]}>{Number(date.slice(8))}</Text><View style={[s.dot, { opacity: dates.includes(date) ? 1 : 0 }, selectedDate === date && { backgroundColor: 'white' }]} /></View>
          </Pressable> : <View key={`blank-${index}`} style={s.cell} />)}</View>
          <View style={s.legend}><View style={s.dot} /><Text style={s.caption}>公演あり（現在の検索・タブの条件）</Text></View>
          <Pressable style={s.clear} onPress={() => choose(null)} accessibilityRole="button" accessibilityLabel="すべての日付を表示"><Text style={s.clearText}>すべての日付を表示</Text></Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  </Modal>;
}
const s = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#152d2466' },
  sheet: { width: '100%', maxWidth: 480, alignSelf: 'center', maxHeight: '90%', backgroundColor: '#f8faf7', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { fontSize: 19, fontWeight: '800', color: '#243c32' }, month: { fontSize: 17, fontWeight: '700', color: '#243c32' },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: '14.285714%', textAlign: 'center', fontSize: 12, color: '#7c8881', paddingVertical: 10 },
  cell: { width: '14.285714%', minHeight: 46, alignItems: 'center', justifyContent: 'center' }, day: { width: 36, height: 42, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 3 },
  dayText: { fontSize: 15, color: '#243c32' }, sunday: { color: '#c75e79' }, saturday: { color: '#527da5' }, selected: { backgroundColor: '#287b59' }, selectedText: { color: 'white', fontWeight: '800' }, dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#287b59' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12, marginBottom: 18 }, caption: { fontSize: 11, color: '#7c8881' }, clear: { minHeight: 44, borderWidth: 1, borderColor: '#d4e4d9', borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'white' }, clearText: { fontSize: 13, fontWeight: '700', color: '#287b59' },
});
