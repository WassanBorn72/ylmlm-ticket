import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowDownUp, ArrowUpRight, Bell, CalendarDays, Check, ChevronRight, Clock3, Heart, MapPin, RefreshCw, Search, Settings, Sparkles, Ticket, X } from 'lucide-react-native';
import { Feed, TicketEvent } from './src/types';
import DateFilter from './src/DateFilter';
import config from './src/tickets/sources.json';
import appConfig from './app.json';
import { collectOfficialDetails, applyOfficialResult, officialSource } from './src/tickets/official.mjs';
import { collectTickets } from './src/tickets/collector.mjs';
import { applyResults, emptyState, feedFromState, markAllRead, parseState } from './src/tickets/state.mjs';

const sites = config.sources.map(source => source.name);
const siteColors: Record<string, string> = { TicketDive: '#eaf8f1', LivePocket: '#fff3da', TIGET: '#eeeafd', 'イープラス': '#ffecec' };
type Tab = 'tickets' | 'new' | 'favorites' | 'settings';
const favoritesKey = 'yuruticket-favorites-v1';
const storageKey = 'yuruticket-device-state-v1';
const time = (value: string | null) => value ? new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '未掲載';
const dateLabel = (value: string) => new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date(`${value}T00:00:00+09:00`));
const shortDate = (value: string) => new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date(`${value}T00:00:00+09:00`));
const money = (amount: number | null, currency: string | null) => amount === null ? '購入先で確認' : new Intl.NumberFormat('ja-JP', { style: 'currency', currency: currency || 'JPY', maximumFractionDigits: currency === 'JPY' ? 0 : 2 }).format(amount);
const priceLabel = (event: TicketEvent) => {
  const prices = event.offers.filter(offer => offer.price !== null && offer.currency === 'JPY').map(offer => offer.price as number);
  if (!prices.length) return event.offers.length ? money(event.offers[0].price, event.offers[0].currency) : '購入先で確認';
  return `${money(Math.min(...prices), 'JPY')}${Math.min(...prices) !== Math.max(...prices) ? '〜' : ''}`;
};

function AppContent() {
  const deviceState = useRef(emptyState());
  const activeRequest = useRef<AbortController | null>(null);
  const savingRead = useRef(false);
  const favoriteRef = useRef<string[]>([]);
  const favoriteWrites = useRef<Promise<void>>(Promise.resolve());
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [feed, setFeed] = useState<Feed>(() => feedFromState(deviceState.current, config));
  const [tab, setTab] = useState<Tab>('tickets');
  const [query, setQuery] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<TicketEvent | null>(null);
  const [descending, setDescending] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadFavorites = AsyncStorage.getItem(favoritesKey).then(raw => {
      const value: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(value) || !value.every(id => typeof id === 'string')) throw new Error();
      if (mounted) { favoriteRef.current = [...new Set(value)]; setFavoriteIds(favoriteRef.current); }
    }).catch(() => { if (mounted) setNotice('お気に入りを読み込めませんでした。'); });
    const loadFeed = AsyncStorage.getItem(storageKey).then(raw => {
      if (!mounted) return;
      deviceState.current = parseState(raw);
      setFeed(feedFromState(deviceState.current, config));
    }).catch(() => { if (mounted) setNotice('前回の取得情報を読み込めませんでした。今回の取得を初回として扱います。'); });
    void Promise.all([loadFeed, loadFavorites]).finally(() => { if (mounted) setPreferencesReady(true); });
    return () => { mounted = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!preferencesReady || activeRequest.current || savingRead.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setProgress('チケットサイトを確認しています…');
    try {
      const [results, official] = await Promise.all([collectTickets(config, {
        signal: controller.signal,
        onSource: result => { if (!controller.signal.aborted) setProgress(`${result.name}を確認しました`); },
      }), collectOfficialDetails({ signal: controller.signal })]);
      if (controller.signal.aborted) return;
      const next = applyResults(deviceState.current, results, config);
      next.official = applyOfficialResult(deviceState.current.official, official);
      deviceState.current = next;
      setFeed(feedFromState(next, config));
      setSelected(null);
      const failed = results.filter(result => result.status !== 'ok').map(result => result.name);
      setError(failed.length ? `${failed.join('・')}を取得できませんでした。取得状況から詳細を確認できます。` : '');
      try { await AsyncStorage.setItem(storageKey, JSON.stringify(next)); }
      catch { setNotice('取得情報を端末に保存できませんでした。次回の新着判定が保持されない場合があります。'); }
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '接続を確認して再試行してください。');
    } finally {
      if (activeRequest.current === controller) { activeRequest.current = null; setLoading(false); setProgress(''); }
    }
  }, [preferencesReady]);

  useEffect(() => {
    if (!preferencesReady) return;
    void refresh();
    let wasBackground = AppState.currentState === 'background';
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'background') {
        wasBackground = true;
        activeRequest.current?.abort(); activeRequest.current = null;
        setLoading(false); setProgress('');
      }
      if (state === 'active' && wasBackground) { wasBackground = false; void refresh(); }
    });
    return () => { activeRequest.current?.abort(); activeRequest.current = null; subscription.remove(); };
  }, [preferencesReady, refresh]);

  const fresh = useCallback((event: TicketEvent) => !event.isBaseline, []);
  const unread = feed.events.filter(fresh).length;
  const matchingEvents = useMemo(() => feed.events.filter(event => {
    if (tab === 'new' && !fresh(event)) return false;
    if (tab === 'favorites' && !favoriteIds.includes(event.id)) return false;
    return `${event.title} ${event.venue} ${event.address}`.toLowerCase().includes(query.trim().toLowerCase());
  }), [feed, tab, fresh, query, favoriteIds]);
  const dates = useMemo(() => [...new Set(matchingEvents.map(event => event.date))].sort(), [matchingEvents]);
  const visible = useMemo(() => matchingEvents.filter(event => selectedDate === null || event.date === selectedDate)
    .sort((a, b) => (a.date.localeCompare(b.date) || (a.startAt ?? '').localeCompare(b.startAt ?? '')) * (descending ? -1 : 1)), [matchingEvents, selectedDate, descending]);

  const markRead = async () => {
    if (activeRequest.current || savingRead.current) return;
    savingRead.current = true;
    const next = markAllRead(deviceState.current);
    try {
      await AsyncStorage.setItem(storageKey, JSON.stringify(next));
      deviceState.current = next; setFeed(feedFromState(next, config));
    } catch { setNotice('既読状態を保存できませんでした。'); }
    finally { savingRead.current = false; }
  };
  const openTicket = async (url: string | null) => {
    if (!url) return;
    try { if (!url.startsWith('https://')) throw new Error(); await Linking.openURL(url); }
    catch { setNotice('リンクを開けませんでした。'); }
  };

  const mapQuery = (event: TicketEvent) => [event.venue === '会場は購入先で確認' ? '' : event.venue, event.address].filter(Boolean).join(' ').trim();
  const openMap = async (event: TicketEvent) => {
    const query = mapQuery(event);
    if (!query) return;
    const encoded = encodeURIComponent(query);
    const webUrl = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
    const url = Platform.OS === 'android' ? `geo:0,0?q=${encoded}` : Platform.OS === 'ios' ? `maps://?q=${encoded}` : webUrl;
    try { await Linking.openURL(url); }
    catch {
      try { await Linking.openURL(webUrl); }
      catch { setNotice('地図を開けませんでした。もう一度お試しください。'); }
    }
  };

  const toggleFavorite = (id: string) => {
    if (!preferencesReady) return;
    // Serialize independent favorite writes so rapid taps cannot restore an older selection.
    favoriteWrites.current = favoriteWrites.current.then(async () => {
      const next = favoriteRef.current.includes(id) ? favoriteRef.current.filter(value => value !== id) : [...favoriteRef.current, id];
      try {
        await AsyncStorage.setItem(favoritesKey, JSON.stringify(next));
        favoriteRef.current = next; setFavoriteIds(next);
      } catch { setNotice('お気に入りを保存できませんでした。もう一度お試しください。'); }
    });
  };
  const favoriteButton = (event: TicketEvent) => <Pressable
    style={s.favoriteButton} disabled={!preferencesReady}
    onPress={press => { press.stopPropagation(); toggleFavorite(event.id); }}
    accessibilityRole="button" accessibilityLabel={`${event.title}をお気に入り${favoriteIds.includes(event.id) ? 'から解除' : 'に登録'}`}
    accessibilityState={{ selected: favoriteIds.includes(event.id) }}>
    <Heart size={21} color={favoriteIds.includes(event.id) ? c.pink : c.muted} fill={favoriteIds.includes(event.id) ? c.pink : 'none'} />
  </Pressable>;

  const renderEvent = (event: TicketEvent) => {
    return <Pressable key={event.id} style={({ pressed }) => [s.card, pressed && s.pressed]} onPress={() => setSelected(event)} accessibilityRole="button" accessibilityLabel={`${shortDate(event.date)} ${event.title} ${event.venue} ${priceLabel(event)}。詳細を表示`}>
      <View style={s.cardTop}>
        <View style={s.dateBox}><Text style={s.month}>{Number(event.date.slice(5, 7))}月</Text><Text style={s.day}>{Number(event.date.slice(8, 10))}</Text><Text style={s.weekday}>{shortDate(event.date).match(/\((.+)\)/)?.[1] || shortDate(event.date).slice(-3)}</Text></View>
        <View style={s.cardMain}>
          <View style={s.row}>{fresh(event) && <View style={s.newBadge}><Text style={s.newText}>NEW</Text></View>}<Text style={s.artist}>ゆるめるモ！</Text></View>
          <Text style={s.eventTitle}>{event.title}</Text>
          <Pressable style={[s.metadata, s.mapLink]} disabled={!mapQuery(event)} onPress={press => { press.stopPropagation(); void openMap(event); }} accessibilityRole="link" accessibilityLabel={`${event.venue}を地図で開く`} accessibilityState={{ disabled: !mapQuery(event) }}><MapPin size={14} color={mapQuery(event) ? c.green : c.muted} /><Text style={[s.metaText, !!mapQuery(event) && s.mapText]}>{event.venue}</Text></Pressable>
        </View>
        {favoriteButton(event)}
      </View>
      <View style={s.cardFacts}>
        <View style={s.metadata}><Clock3 size={14} color={c.muted} /><Text style={s.timeText}>OPEN {time(event.doorsAt)} / START {time(event.startAt)}</Text></View>
        <Text style={s.price}>{priceLabel(event)}</Text>
      </View>
      {!!event.staleSourceIds?.length && <Text style={s.warningText}>一部は前回取得の情報です · 取得状況を確認</Text>}
      {event.notes?.some(note => note.text.includes('時間が異なります')) && <Text style={s.warningText}>時間の記載に差があります · 詳細を確認</Text>}
      <View style={s.cardFooter}><View style={s.siteBadges}>{[...new Set(event.offers.map(offer => offer.sourceName))].map(name => <View key={name} style={[s.siteBadge, { backgroundColor: siteColors[name] || c.mint }]}><Text style={s.siteBadgeText}>{name}</Text></View>)}</View><ChevronRight size={18} color={c.muted} /></View>
    </Pressable>;
  };

  return <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
    <StatusBar barStyle="dark-content" />
    <View style={s.page}>
      <View style={s.header}><View style={s.brandRow}><Image source={require('./assets/app-icon.png')} style={s.appIcon} accessibilityIgnoresInvertColors accessible={false} /><View style={{ flex: 1 }}><Text style={s.brand}>モ！のチケット帳</Text><Text style={s.unofficialName}>（非公式）</Text></View></View><View style={s.row}><Pressable disabled={loading || !preferencesReady} onPress={() => { void refresh(); }} style={s.bellButton} accessibilityRole="button" accessibilityLabel="チケット情報を更新"><RefreshCw size={22} color={c.ink} /></Pressable><Pressable onPress={() => { setTab('new'); setSelectedDate(null); setQuery(''); }} style={s.bellButton} accessibilityRole="button" accessibilityLabel={`新着 ${unread} 件`}><Bell size={22} color={c.ink} />{unread > 0 && <View style={s.bellDot} />}</Pressable></View></View>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={c.green} />}>
        {loading && <View style={s.notice}><ActivityIndicator color={c.green} /><Text style={s.noticeText}>{progress}{feed.events.length ? ' · 前回の取得内容を表示中' : ''}</Text></View>}
        {notice !== '' && <View style={s.notice}><Text style={s.noticeText}>{notice}</Text><Pressable onPress={() => setNotice('')} accessibilityRole="button" accessibilityLabel="メッセージを閉じる"><X size={18} color={c.ink} /></Pressable></View>}
        {error !== '' && <View style={s.error}><Text style={s.noticeText}>更新できませんでした。{feed.events.length ? '一部に前回取得の情報が含まれます。' : ''} {error}</Text><Pressable onPress={refresh} accessibilityRole="button" accessibilityLabel="再試行"><RefreshCw size={18} color={c.ink} /></Pressable></View>}
        {tab === 'settings' ? <>
          <Text style={s.pageTitle}>取得状況</Text><Text style={s.subtitle}>開いたときに、最新の掲載情報を確認。</Text>
          <View style={s.settingsCard}><Text style={s.sectionTitle}>このアプリの更新方法</Text><Text style={s.bodyText}>起動時・バックグラウンドから戻ったとき・手動更新時に、端末からチケットサイトへ接続します。アプリを閉じている間は取得しません。新着は次に開いたときに表示し、プッシュ通知は送りません。</Text><Pressable style={[s.primaryButton, loading && s.disabled]} disabled={loading || !preferencesReady} onPress={() => { void refresh(); }} accessibilityRole="button" accessibilityLabel="今すぐ更新"><Text style={s.primaryText}>{loading ? '確認中…' : '今すぐ更新'}</Text><RefreshCw size={17} color="white" /></Pressable><Text style={s.smallText}>前回取得の公演ID・既読状態・お気に入りは、この端末だけに保存します。端末間の同期はありません。</Text></View>
          <View style={s.settingsCard}><Text style={s.sectionTitle}>情報の取得状況</Text><Text style={s.bodyText}>取得エラーがある場合、最新のチケットが反映されていないことがあります。</Text>{Platform.OS === 'web' && <Text style={s.smallText}>ブラウザー版では一部のサイトに直接接続できません。スマホアプリでの接続をご確認ください。</Text>}{[...sites, officialSource.name].map(name => {
            const status = name === officialSource.name ? { ...deviceState.current.official, found: deviceState.current.official?.announcements.length } : feed.sources.find(source => source.name === name);
            return <View key={name} style={s.sourceStatus}><View style={s.between}><Text style={s.sourceName}>{name}</Text><Text style={[s.statusText, status?.status === 'ok' && { color: c.green }]}>{status?.status === 'ok' ? `確認済み・${status.found ?? 0} 件` : status?.status === 'error' ? '取得エラー' : status?.status === 'pending' ? '確認中' : '未設定'}</Text></View>{status?.errors?.map((message, index) => <Text key={index} style={s.smallText}>{message}</Text>)}{status?.lastSuccessAt && <Text style={s.smallText}>前回成功: {new Date(status.lastSuccessAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</Text>}</View>;
          })}<Text style={s.smallText}>最終確認: {feed.lastSyncAt ? new Date(feed.lastSyncAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '未取得'}</Text></View>
          <View style={s.settingsCard}><Text style={s.sectionTitle}>モ！のチケット帳（非公式）について</Text><Text style={s.smallText}>バージョン {appConfig.expo.version}</Text><Text style={s.bodyText}>ゆるめるモ！のチケット情報をまとめる非公式アプリです。ゆるめるモ！および各チケット販売サイトが提供・運営する公式アプリではありません。料金・時間・販売状況の最終確認は各チケットサイトでお願いします。取得できない料金は「購入先で確認」、時間は「未掲載」と表示します。</Text></View>
        </> : <>
          {tab === 'favorites' && <View style={s.intro}><View style={s.row}><Heart size={24} color={c.pink} /><Text style={s.pageTitle}>お気に入り</Text></View><Text style={s.subtitle}>登録した公演のうち、掲載中の情報を表示。</Text></View>}
          {tab === 'new' && <View style={s.intro}><View style={s.row}><Sparkles size={24} color={c.green} /><Text style={s.pageTitle}>新着チケット</Text></View><Text style={s.subtitle}>前回から新しく見つかった掲載情報。</Text><Pressable onPress={markRead} disabled={loading || !preferencesReady || unread === 0} style={s.readButton} accessibilityRole="button"><Check size={16} color={c.green} /><Text style={s.readText}>すべて既読にする</Text></Pressable></View>}
          <View style={s.searchBox}><Search size={19} color={c.muted} /><TextInput style={s.searchInput} value={query} onChangeText={setQuery} placeholder="公演名・会場でさがす" placeholderTextColor="#999f9c" accessibilityLabel="公演名・会場で検索" />{query !== '' && <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="検索をクリア"><X size={18} color={c.muted} /></Pressable>}</View>
          <View style={s.dateFilterRow}>
            <Pressable onPress={() => setCalendarOpen(true)} style={[s.dateFilterButton, selectedDate !== null && s.dateFilterSelected]} accessibilityRole="button" accessibilityLabel="日付で絞り込む" accessibilityState={{ expanded: calendarOpen }}><CalendarDays size={18} color={c.green} /><Text style={s.dateFilterText}>{selectedDate ? dateLabel(selectedDate) : '日付で絞り込む'}</Text><ChevronRight size={16} color={c.green} /></Pressable>
            {selectedDate !== null && <Pressable style={s.clearDateButton} onPress={() => setSelectedDate(null)} accessibilityRole="button" accessibilityLabel="日付の絞り込みを解除"><X size={16} color={c.muted} /><Text style={s.clearDateText}>解除</Text></Pressable>}
          </View>
          <View style={s.listHeading}><View style={s.row}><CalendarDays size={19} color={c.ink} /><Text style={s.sectionTitle}>{tab === 'new' ? '未読の新着' : tab === 'favorites' ? '登録したライブ' : 'これからのライブ'}</Text><Text style={s.count}>{visible.length}</Text></View><Pressable onPress={() => setDescending(!descending)} style={s.row} accessibilityRole="button" accessibilityLabel="日付の並び順を変更"><ArrowDownUp size={13} color={c.muted} /><Text style={s.sortLabel}>{descending ? '新しい日付順' : '開催日順'}</Text></Pressable></View>
          {loading && !feed.events.length ? <View style={s.empty}><ActivityIndicator color={c.green} /><Text style={s.bodyText}>チケット情報を確認しています…</Text></View> : visible.length ? visible.map(renderEvent) : <View style={s.empty}><Ticket size={40} color="#b0c9bb" /><Text style={s.emptyTitle}>{query || selectedDate !== null ? '条件に合う公演がありません' : tab === 'new' ? '新着はすべてチェック済み' : tab === 'favorites' ? '掲載中のお気に入りはありません' : 'まだ公演情報がありません'}</Text><Text style={s.emptyText}>{query || selectedDate !== null ? '日付や検索条件を変更してください。' : tab === 'new' ? '次に開いたときに、新しい公演を確認します。' : tab === 'favorites' ? '公演のハートを押して登録できます。' : '取得状況は設定から確認できます。'}</Text></View>}
          <Text style={s.footerNote}>※ 料金は券種により異なります。手数料・ドリンク代は購入先でご確認ください。</Text>
        </>}
      </ScrollView>
      <View style={s.nav}>{([{ key: 'tickets', label: 'チケット', Icon: Ticket }, { key: 'new', label: '新着', Icon: Bell }, { key: 'favorites', label: 'お気に入り', Icon: Heart }, { key: 'settings', label: '設定', Icon: Settings }] as const).map(({ key, label, Icon }) => <Pressable key={key} style={s.navItem} onPress={() => { setTab(key); setSelectedDate(null); setQuery(''); }} accessibilityRole="tab" accessibilityLabel={key === 'new' ? `新着 ${unread} 件` : label} accessibilityState={{ selected: tab === key }}><View><Icon size={22} strokeWidth={tab === key ? 2.4 : 1.8} color={tab === key ? c.green : c.muted} />{key === 'new' && unread > 0 && <View style={s.navBadge}><Text style={s.navBadgeText}>{unread}</Text></View>}</View><Text style={[s.navText, tab === key && s.navActive]}>{label}</Text></Pressable>)}</View>
    </View>
    <DateFilter visible={calendarOpen} dates={dates} selectedDate={selectedDate} onSelect={setSelectedDate} onClose={() => setCalendarOpen(false)} />
    <Modal visible={selected !== null} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
      <View style={s.modalBackdrop}><Pressable style={StyleSheet.absoluteFillObject} onPress={() => setSelected(null)} accessibilityLabel="詳細を閉じる" accessibilityRole="button" /><SafeAreaView edges={['bottom']} style={s.modalSheet}><View style={s.sheetHandle} /><View style={s.between}><Text style={s.sectionTitle}>公演・チケット詳細</Text><Pressable onPress={() => setSelected(null)} style={s.closeButton} accessibilityRole="button" accessibilityLabel="閉じる"><X size={22} color={c.ink} /></Pressable></View>{selected && <ScrollView><View style={s.between}><Text style={s.detailDate}>{shortDate(selected.date)}</Text>{favoriteButton(selected)}</View><Text style={s.detailTitle}>{selected.title}</Text><Pressable style={[s.detailFact, s.mapLink]} disabled={!mapQuery(selected)} onPress={() => { void openMap(selected); }} accessibilityRole="link" accessibilityLabel={`${selected.venue}を地図で開く`} accessibilityState={{ disabled: !mapQuery(selected) }}><MapPin size={18} color={c.green} /><View style={{ flex: 1 }}><Text style={[s.sourceName, !!mapQuery(selected) && s.mapText]}>{selected.venue}</Text><Text style={s.smallText}>{selected.address || '住所未掲載'}{mapQuery(selected) ? ' · 地図で開く' : ''}</Text></View><ArrowUpRight size={18} color={c.green} /></Pressable><View style={s.detailFact}><Clock3 size={18} color={c.green} /><Text style={s.bodyText}>開場 {time(selected.doorsAt)}　開演 {time(selected.startAt)}</Text></View>{selected.officialDetails && <View><Text style={s.detailHeading}>公式告知の詳細</Text>{selected.officialDetails.stale && <Text style={s.warningText}>前回取得の公式情報です。最新の告知をご確認ください。</Text>}<Text style={s.bodyText}>出演時間：{selected.officialDetails.performance.join(' / ') || '未掲載'}</Text><Text style={s.bodyText}>特典会時間：{selected.officialDetails.meetAndGreet.join(' / ') || '未掲載'}</Text>{selected.officialDetails.supplements.length > 0 && <View><Text style={s.sourceName}>その他補足</Text>{selected.officialDetails.supplements.map((text, index) => <Text key={index} style={s.bodyText}>・{text}</Text>)}</View>}<Text style={s.smallText}>公式情報確認：{new Date(selected.officialDetails.checkedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</Text></View>}<Text style={s.detailHeading}>公式の情報を確認</Text><Pressable onPress={() => { void openTicket('https://ylmlm.jp/'); }} accessibilityRole="link" accessibilityLabel="公式サイトを開く"><Text style={[s.bodyText, s.mapText]}>公式サイト ↗</Text></Pressable><Pressable onPress={() => { void openTicket('https://x.com/ylmlm_official'); }} accessibilityRole="link" accessibilityLabel="公式Xを開く"><Text style={[s.bodyText, s.mapText]}>公式X ↗</Text></Pressable>{selected.officialDetails && <Pressable onPress={() => { void openTicket(selected.officialDetails!.url); }} accessibilityRole="link" accessibilityLabel="公式告知を確認"><Text style={[s.bodyText, s.mapText]}>公式カレンダーの告知 ↗</Text></Pressable>}{selected.officialDetails?.postUrls?.map(url => <Pressable key={url} onPress={() => { void openTicket(url); }} accessibilityRole="link" accessibilityLabel="この公演の公式X投稿を開く"><Text style={[s.bodyText, s.mapText]}>この公演の公式X投稿 ↗</Text></Pressable>)}<Text style={s.detailHeading}>購入先を選ぶ</Text>{selected.notes?.map((note, index) => <View key={index} style={s.detailNotice}><Text style={s.warningText}>{note.text}</Text></View>)}{selected.offers.map((offer, index) => <Pressable key={`${offer.sourceId}-${index}`} disabled={!offer.url} onPress={() => { void openTicket(offer.url); }} style={[s.offer, !offer.url && s.sampleOffer]} accessibilityRole="link" accessibilityState={{ disabled: !offer.url }}><View style={{ flex: 1 }}><Text style={s.sourceName}>{offer.sourceName}</Text><Text style={s.smallText}>{offer.label}{selected.staleSourceIds?.includes(offer.sourceId) ? ' · 前回取得' : ''}{offer.availability === 'SoldOut' ? ' · 完売' : offer.availability === 'PreOrder' ? ' · 予約販売' : ''}</Text>{offer.note && <Text style={s.smallText}>{offer.note}</Text>}</View><Text style={s.offerPrice}>{money(offer.price, offer.currency)}</Text>{offer.url ? <ArrowUpRight size={19} color={c.green} /> : <Text style={s.smallText}>サンプル</Text>}</Pressable>)}<Text style={s.footerNote}>掲載料金と別に手数料・ドリンク代等がかかる場合があります。販売中かどうか、最新の価格・日時は購入先をご確認ください。</Text><Text style={s.smallText}>情報確認: {new Date(selected.updatedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</Text><View style={{ height: 24 }} /></ScrollView>}</SafeAreaView></View>
    </Modal>
  </SafeAreaView>;
}

export default function App() { return <SafeAreaProvider><AppContent /></SafeAreaProvider>; }

const c = { bg: '#f8faf7', ink: '#243c32', muted: '#7c8881', green: '#287b59', mint: '#e6f4eb', pink: '#e789a0', border: '#e7ece7' };
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg }, page: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center', backgroundColor: c.bg },
  header: { paddingHorizontal: 14, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.bg },
  brandRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 8 }, appIcon: { width: 36, height: 36, borderRadius: 9 }, unofficialName: { fontSize: 11, fontWeight: '700', color: c.green, letterSpacing: 0 }, brand: { fontSize: 18, fontWeight: '900', color: c.ink, letterSpacing: 0 }, bellButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border, borderRadius: 17, backgroundColor: 'white' }, bellDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.pink, position: 'absolute', top: 9, right: 10 },
  scroll: { flex: 1 }, content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 }, demoBanner: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 10, borderRadius: 10, backgroundColor: '#fff6e5', marginBottom: 14 }, demoText: { color: '#946b18', fontSize: 10, flex: 1, lineHeight: 16 }, notice: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: 12, backgroundColor: c.mint, marginBottom: 12 }, error: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: 12, backgroundColor: '#ffe9e7', marginBottom: 12 }, noticeText: { flex: 1, fontSize: 12, lineHeight: 19, color: c.ink },
  favoriteButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  mapLink: { minHeight: 44 }, mapText: { color: c.green, textDecorationLine: 'underline' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 }, between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: c.border, backgroundColor: 'white', borderRadius: 14, paddingHorizontal: 15, marginBottom: 15, minHeight: 48 }, searchInput: { flex: 1, fontSize: 13, color: c.ink, paddingVertical: 14 },
  dateFilterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, dateFilterButton: { flex: 1, minHeight: 46, borderWidth: 1, borderColor: c.border, borderRadius: 12, backgroundColor: 'white', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }, dateFilterSelected: { backgroundColor: c.mint, borderColor: '#cbded1' }, dateFilterText: { flex: 1, fontSize: 13, fontWeight: '600', color: c.green }, clearDateButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8 }, clearDateText: { color: c.muted, fontSize: 12 }, listHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 23, marginBottom: 15 }, sectionTitle: { fontSize: 15, fontWeight: '800', color: c.ink }, count: { color: c.green, fontSize: 11, fontWeight: '700', backgroundColor: c.mint, overflow: 'hidden', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8 }, sortLabel: { fontSize: 10, color: c.muted },
  card: { backgroundColor: 'white', borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: c.border }, pressed: { opacity: 0.75 }, cardTop: { flexDirection: 'row', gap: 13, alignItems: 'flex-start' }, dateBox: { backgroundColor: '#f1f6f0', borderRadius: 13, width: 53, alignItems: 'center', paddingVertical: 9 }, month: { fontSize: 10, color: c.green, fontWeight: '700' }, day: { fontSize: 25, fontWeight: '900', color: c.ink, marginVertical: 2 }, weekday: { fontSize: 10, color: c.muted }, cardMain: { flex: 1, paddingTop: 2 }, artist: { fontSize: 10, color: c.muted, fontWeight: '600' }, newBadge: { backgroundColor: '#e8f5d8', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 }, newText: { color: '#4f7930', fontWeight: '800', fontSize: 8, letterSpacing: 0.6 }, eventTitle: { color: c.ink, fontSize: 14, fontWeight: '800', lineHeight: 22, marginVertical: 6 }, metadata: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 }, metaText: { fontSize: 11, lineHeight: 17, color: c.muted, flexShrink: 1 }, closeButton: { padding: 6 }, cardFacts: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 15, marginBottom: 14, gap: 8, flexWrap: 'wrap' }, timeText: { fontSize: 10, color: c.muted, letterSpacing: 0.2 }, price: { fontSize: 16, fontWeight: '800', color: c.ink }, cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTopWidth: 1, borderColor: '#f0f2ed' }, siteBadges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', flex: 1 }, siteBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5 }, siteBadgeText: { fontSize: 9, fontWeight: '600', color: '#65746b' },
  nav: { flexDirection: 'row', paddingTop: 13, paddingBottom: 12, borderTopWidth: 1, borderColor: c.border, backgroundColor: 'white' }, navItem: { flex: 1, alignItems: 'center', gap: 6 }, navText: { fontSize: 9, color: c.muted }, navActive: { color: c.green, fontWeight: '700' }, navBadge: { position: 'absolute', right: -10, top: -5, backgroundColor: c.pink, minWidth: 15, height: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, navBadgeText: { fontSize: 8, color: 'white', fontWeight: '800' }, footerNote: { color: '#8c9690', fontSize: 10, lineHeight: 18, marginTop: 12, marginBottom: 12 },
  intro: { paddingTop: 10, marginBottom: 20 }, pageTitle: { fontSize: 24, fontWeight: '900', color: c.ink, marginVertical: 4 }, subtitle: { fontSize: 12, color: c.muted, marginTop: 8, marginBottom: 18 }, readButton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end' }, readText: { fontSize: 12, color: c.green }, empty: { paddingVertical: 46, alignItems: 'center', gap: 14 }, emptyTitle: { fontSize: 15, fontWeight: '700', color: c.ink }, emptyText: { fontSize: 12, color: c.muted, textAlign: 'center', lineHeight: 20 },
  settingsCard: { backgroundColor: 'white', borderRadius: 18, padding: 20, borderWidth: 1, borderColor: c.border, marginBottom: 16 }, bodyText: { color: c.muted, fontSize: 12, lineHeight: 22, marginTop: 9, marginBottom: 9 }, primaryButton: { backgroundColor: c.green, borderRadius: 12, padding: 15, marginVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, primaryText: { color: 'white', fontSize: 13, fontWeight: '700' }, disabled: { opacity: 0.5 }, smallText: { color: c.muted, fontSize: 10, lineHeight: 18, marginTop: 4 }, sourceStatus: { borderBottomWidth: 1, borderColor: c.border, paddingVertical: 13 }, sourceName: { fontSize: 13, fontWeight: '700', color: c.ink }, statusText: { color: c.muted, fontSize: 11 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#152d2466' }, modalSheet: { backgroundColor: c.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '85%', padding: 22, width: '100%', maxWidth: 760, alignSelf: 'center' }, sheetHandle: { width: 36, height: 4, borderRadius: 3, backgroundColor: '#c9d3cb', alignSelf: 'center', marginBottom: 18 }, detailDate: { color: c.green, fontSize: 14, fontWeight: '700', marginTop: 20, marginBottom: 10 }, detailTitle: { color: c.ink, fontSize: 22, fontWeight: '800', lineHeight: 33, marginBottom: 14 }, detailFact: { flexDirection: 'row', gap: 10, alignItems: 'center', marginVertical: 7 }, detailHeading: { color: c.ink, fontSize: 15, fontWeight: '800', marginTop: 22, marginBottom: 12 }, offer: { backgroundColor: 'white', borderWidth: 1, borderColor: c.border, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, marginBottom: 9 }, offerPrice: { color: c.ink, fontSize: 16, fontWeight: '800' }, sampleOffer: { backgroundColor: '#f0f4ef' }, warningText: { color: '#986721', fontSize: 11, lineHeight: 18, marginBottom: 8 }, detailNotice: { backgroundColor: '#fff5e3', borderRadius: 10, padding: 12, marginBottom: 9 },
});
