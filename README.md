# ゆるチケ

ゆるめるモ！のチケット情報を複数の販売サイトから集め、会場・チケット代・開場／開演時間を一覧で確認する、非公式の iPhone / Android アプリです。新しい公演が見つかったときは、スマホへのプッシュ通知でお知らせすることを目指しています。

公式サイトや X の告知を待たず、チケットサイトに掲載された情報を直接確認するためのアプリです。Expo / React Native のアプリと、Node.js の定期取得サーバーで構成しています。

## 開発状況

**現在は試作版です。API 接続先を設定しない場合は、架空の公演を使ったサンプル画面が表示されます。** 一覧・検索・お気に入り・新着管理と通知の登録処理は実装済みですが、実サイトの自動取得と実機への通知配信は未完成です。

| 項目 | 状況 |
| --- | --- |
| 一覧・検索・絞り込み・お気に入り・新着管理 | 実装済み。スマホ幅のブラウザーで操作を検証 |
| 定期取得・新着判定・通知キュー | 実装済み。合成データによる 12 件のテストが成功 |
| iPhone / Android / Web | 各プラットフォーム用の JavaScript バンドル生成を確認 |
| 各サイトからの実データ取得 | 巡回 URL・サイト専用の取得処理が未設定／未検証 |
| 実機へのプッシュ通知 | EAS・Apple / Firebase の設定と実機での配信検証が必要 |

## 取得対象のチケットサイト

| サイト | URL |
| --- | --- |
| TicketDive | https://ticketdive.com/ |
| LivePocket | https://t.livepocket.jp/ |
| TIGET | https://tiget.net/ |
| イープラス | https://eplus.jp/ |
| ローチケ | https://l-tike.com/ |
| Buzzチケ | https://buzz-ticket.com/ |

上記は取得対象の一覧です。現時点で全サイトから取得できるという意味ではありません。

## 現在の実装範囲

- 公演一覧、検索、チケットサイト別フィルター、開催日順の並べ替え
- 購入先ごとの料金表示、外部チケットページへのリンク
- 端末に保存するお気に入りと新着の既読管理
- 取得元ごとの未設定・成功・失敗表示
- 15 分間隔の取得ワーカー、初回の既存公演を除いた新着判定
- 同じ日時・会場・タイトルの公演を統合し、購入先を併記（別タイトルの同一公演は自動統合しません）
- Expo Push の端末登録・解除、永続通知キュー、再試行、配信レシートの確認

**実サイトとの接続は未完成です。** 現状の抽出器は `schema.org Event / MusicEvent / Festival` の JSON-LD が HTML に含まれるページに対応しています。各社の実ページ・検索ページの検証は、クラウドの接続制限のため未実施です。サイト専用 HTML、JavaScript で描画される情報、会員認証が必要な情報には追加アダプターが必要です。「6 サイト対応済み」を意味しません。

## クイックスタート

Node.js 24 以降を使用します。作業ディレクトリは `/workspace/ylmlm-ticket` です。

```sh
npm ci --cache /tmp/ylmlm-npm-cache
npm run web
```

クラウド内の非対話起動では `EXPO_UNSTABLE_HEADLESS=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 npm run web -- --port 8081 --max-workers 2` を使えます。スマホ実機での開発は通常の `npm start` を使います。

`EXPO_PUBLIC_API_URL` が未設定の場合、明示的なサンプル画面になります。サンプルの公演・会場・料金は架空で、購入リンクや通知登録はありません。

別ターミナルで API を起動します。

```sh
npm run server
```

API に接続する Web 版の起動例（サーバーを先に起動）：

```sh
EXPO_PUBLIC_API_URL=http://localhost:3001 npm run web
```

接続先が設定されているときは、API 障害をサンプルデータで隠しません。エラー表示し、以前取得した画面の内容があれば保持します。公演一覧の端末への永続キャッシュはまだありません。

実機は `localhost` で開発 PC のサーバーへ接続できません。到達できる API の URL を `.env` に設定して Expo を再起動してください。`.env.example` が設定項目の説明です。プッシュ通知を利用する接続先には HTTPS が必要です。

## プロジェクト構成

```text
App.tsx                         一覧・詳細・お気に入り・新着・設定画面
src/demo.ts                     サンプルデータ（架空の公演）
src/notificationRegistration.ts  端末の通知権限・登録・解除
server/index.mjs                HTTP API と定期取得ワーカーの起動
server/collector.mjs            一覧からの公演 URL 発見と取得
server/extract.mjs              JSON-LD から公演情報を抽出
server/store.mjs                公演の統合・新着判定・状態の保存
server/notifications.mjs        通知送信・再試行・配信レシート確認
server/sources.example.json     6 サイトの取得元設定テンプレート
server/workflow.test.mjs        サーバー側のテスト
scripts/smoke-web.mjs           スマホ幅のブラウザー操作テスト
```

アプリはサーバーから公演一覧を取得します。サーバーはチケットサイトを定期確認して状態を保存し、新着があれば登録済みの端末へ Expo Push を通じて通知します。アプリを閉じている間も確認するには、サーバーを継続稼働させる必要があります。

## 実際の取得元を設定する

`server/sources.example.json` は **未検証の設定テンプレート** です。巡回 URL は空にしています。パスの正規表現も実ページで検証して調整する必要があります。

1. 各サイトの「ゆるめるモ！」専用の検索結果／アーティスト一覧 URL と、代表的な公演ページを確認します。
2. 実際の HTML に対応する抽出器を検証・必要なら実装します。未対応ページは取得エラーとして表示されます。
3. テンプレートをローカル設定へコピーし、`listingUrls` または `eventUrls` と `allowedHosts` を記入します。

```sh
mkdir -p server/data
cp server/sources.example.json server/data/sources.local.json
SOURCE_CONFIG=server/data/sources.local.json npm run sync
SOURCE_CONFIG=server/data/sources.local.json npm run server
```

`sync` は、常駐サーバーを停止した状態で実行してください。同一の状態ファイルに複数プロセスで書き込む構成は対応していません。設定ファイルの変更後はサーバーを再起動します。

`listingUrls` を設定したサイトでは、一覧から `eventPathPattern` に一致する公演リンクを毎回見つけて取得します。`eventUrls` だけでは登録済み URL の監視となり、新たな URL の発見はできません。検索結果が HTML に含まれない場合は、公式 API やブラウザーを使うサイト専用アダプターが必要です。

巡回は許可した HTTPS ホストのみで、リダイレクト先もチェックします。1 ページ 2 MB、15 秒、1 サイト 50 公演の上限を設けています。取得できない日時や料金は推測せず未発表と表示します。時差指定のない日本の開催日時は JST として扱います。

初回の完全に成功した取得を基準とし、それまでに見つかった公演は通知しません。失敗が混じった初回でも成功分は表示しますが、基準の確定を保留します。基準確定後に初めて見つかった公演を通知します。既存公演の料金変更や別サイトの購入先追加は通知しません。取得失敗時に以前の情報は削除しないため、設定画面の最終確認と取得状況を確認できます。

## 実機プッシュ通知

1. Expo / EAS のプロジェクトを作成し、`.env` または EAS 環境に `EXPO_PUBLIC_EAS_PROJECT_ID` と HTTPS の `EXPO_PUBLIC_API_URL` を設定します。
2. Apple / Firebase のプッシュ資格情報を EAS の安全な設定画面で登録します。秘密鍵を Git やチャットへ記載しないでください。
3. `eas.json` の development / preview ビルドを実機へインストールします。開発ビルドには `expo-dev-client` を導入済みです。Expo Go や Web の通知は対象外です。
4. アプリの「設定 → 新着通知をオンにする」で権限と通知先を登録します。
5. ワーカー稼働後の新着公演で、実機への配信と通知タップ時の詳細表示を確認します。

端末トークン・解除用 ID・配信キューは API の `server/data/state.json` に保存します。データディレクトリは永続ボリュームに置き、外部公開しないでください。通知 OFF はサーバー登録と未送信キューを解除します。Expo の受付成功と端末への到着は異なるため、15 分後に配信レシートを確認します。通信断による再送で重複配信が起きる可能性があり、完全な一度限りの配信は保証しません。

本番運用には常時起動する HTTPS API、永続ストレージ、取得・通知失敗の監視が必要です。この実装は単一プロセス向けの MVP です。本番公開前には API ゲートウェイ側のレート制限なども設計してください。

## API / サーバー設定

| 項目 | 用途 / 既定値 |
| --- | --- |
| `GET /health` | API プロセスの応答確認。サイト取得や通知の成功を意味しません |
| `GET /api/events` | JST で今日以降の公演、取得元の状態、最終確認日時 |
| `POST /api/subscriptions` | `{ "token": "ExpoPushToken[...]" }` を登録し解除用 ID を返す |
| `DELETE /api/subscriptions/:id` | 解除用 ID を持つ端末の購読を解除 |
| `PORT` | `3001` |
| `POLL_INTERVAL_MS` | `900000`（15 分）。最小 60000 |
| `SOURCE_CONFIG` | `server/sources.json` |
| `DATA_DIR` | `server/data` |
| `ALLOWED_ORIGINS` | `http://localhost:8081`。Web クライアントのオリジンをカンマ区切り |

## 開発コマンドと検証

| コマンド | 用途 |
| --- | --- |
| `npm start` | Expo の開発サーバーを起動 |
| `npm run ios` / `npm run android` | 各プラットフォーム向けに開発サーバーを起動（対応する開発環境が必要） |
| `npm run web` | Web 版を起動 |
| `npm run server` | API と定期取得ワーカーを起動 |
| `npm run sync` | 一度だけ取得を実行。未設定・取得エラー時は終了コード 1 |
| `npm run typecheck` | TypeScript の型チェック |
| `npm test` | サーバー側のテスト |
| `npm run build:web` | Web 版を `dist/` に出力 |
| `npm run test:web` | 起動済みのサンプル画面をブラウザーで操作テスト |

```sh
npm run typecheck
npm test
EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 npm run build:web
```

抽出、対象アーティストの判定、初回／新着、昼夜公演の区別、複数サイトの統合、API の登録解除、通知失敗と配信レシートを合成フィクスチャーで検証します。実サイト取得、実機プッシュ、ストア配布の検証は別途必要です。

ブラウザーの操作テストも用意しています。サンプルの Web ビルドを配信してから別ターミナルで実行します。

```sh
python3 -m http.server 8081 --bind 127.0.0.1 --directory dist
# 別ターミナル。Chromium 導入済みのクラウド環境での例:
CI=1 CHROMIUM_PATH=/usr/bin/chromium npm run test:web
```

Chromium がない環境では `npx playwright install chromium` でブラウザーを導入します。`WEB_TEST_URL` でテスト先、`SCREENSHOT_PATH` でスクリーンショットの保存先を変更できます。検索、詳細、絞り込み、お気に入り・既読の再読み込み後の保存状態を確認します。

クラウドの接続許可候補は `ticketdive.com`、`t.livepocket.jp`、`tiget.net`、`eplus.jp`、`l-tike.com`、`buzz-ticket.com`、Expo 通知 API の `exp.host` です。必要なサブドメインは、実際のリダイレクトや公式 API を調べて追加します。

## 今後の作業

1. チケットサイトへの接続を許可し、各サイトの検索結果・アーティスト一覧・公演ページを調査する。
2. サイトごとの取得処理を実装し、会場・日時・料金・購入先と新規公演 URL の発見を実データで検証する。
3. 同一公演のタイトルや会場名の表記揺れに対応し、複数サイト間の重複判定を改善する。
4. HTTPS API と永続ストレージを用意し、定期取得・通知の失敗を監視する。
5. iPhone / Android の実機で新着通知・通知解除・通知タップ時の詳細表示を確認する。

このアプリは、ゆるめるモ！および各チケット販売サイトの公式アプリではありません。購入・販売状況の最終確認は、各チケットサイトで行ってください。
