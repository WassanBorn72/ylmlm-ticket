import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { request } from './request';

const storageKey = 'yuruticket-push-registration';
export type Registration = { id: string; apiUrl: string };

export async function loadRegistration(): Promise<Registration | null> {
  const stored = await AsyncStorage.getItem(storageKey);
  if (!stored) return null;
  try { return JSON.parse(stored); } catch { return null; }
}

export async function enableNotifications(apiUrl: string): Promise<Registration> {
  if (Platform.OS === 'web') throw new Error('プッシュ通知は iPhone・Android の実機アプリで利用できます。');
  if (!Device.isDevice) throw new Error('通知登録には実機が必要です。');
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId) throw new Error('Expo のプロジェクト ID が未設定です。開発用ビルドの設定が必要です。');
  if (!apiUrl.startsWith('https://')) throw new Error('実機通知には HTTPS の API 接続先を設定してください。');
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('tickets', { name: '新着チケット', importance: Notifications.AndroidImportance.HIGH });
  const current = await Notifications.getPermissionsAsync();
  const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!permission.granted && permission.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL) throw new Error('通知の許可が必要です。端末の設定から変更できます。');
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const response = await request(`${apiUrl}/api/subscriptions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
  if (!response.ok) throw new Error('通知の登録に失敗しました。サーバー接続と登録状況を確認してください。');
  const { id } = await response.json();
  const registration = { id, apiUrl };
  try { await AsyncStorage.setItem(storageKey, JSON.stringify(registration)); }
  catch (error) {
    await request(`${apiUrl}/api/subscriptions/${id}`, { method: 'DELETE' });
    throw error;
  }
  return registration;
}

export async function disableNotifications(registration: Registration) {
  const response = await request(`${registration.apiUrl}/api/subscriptions/${registration.id}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('通知の解除に失敗しました。接続を確認して再試行してください。');
  await AsyncStorage.removeItem(storageKey);
}
