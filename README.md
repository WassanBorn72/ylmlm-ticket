# ゆるチケ

ゆるめるモ！のチケット情報を複数の販売サイトから集め、会場・チケット代・開場／開演時間を一覧で確認する、非公式の iPhone / Android アプリです。新しい公演が見つかったときは、スマホへのプッシュ通知でお知らせすることを目指しています。

公式サイトや X の告知を待たず、チケットサイトに掲載された情報を直接確認するためのアプリです。Expo / React Native のアプリと、Node.js の定期取得サーバーで構成しています。

## 開発状況

**現在は試作版です。** TicketDive・LivePocket・TIGET・イープラスからの実データ取得を確認しました。API 接続先を設定しない場合はサンプル表示、設定した場合は取得した公演を表示します。実機へのプッシュ通知配信は、資格情報の設定と実機検証が残っています。

| 項目 | 状況 |
| --- | --- |
| 一覧・検索・絞り込み・お気に入り・新着管理 | 実装済み。スマホ幅のブラウザーで操作を検証 |
| 定期取得・新着判定・通知キュー | 実装済み。実ページの項目抜粋と合成データによる 22 件のテストが成功 |
| iPhone / Android / Web | 各プラットフォーム用の JavaScript バンドル生成を確認 |
| 実データ取得 | 2026年10月11日（日本時間）に重複統合後 11 公演を取得。内訳は下表参照 |
| 実機へのプッシュ通知 | EAS・Apple / Firebase の設定と実機での配信検証が必要 |

## 取得対象のチケットサイト

| サイト | URL | 確認結果（2026年10月11日・日本時間） |
| --- | --- | --- |
| TicketDive | https://ticketdive.com/ | 検索から 6 公演の日時・会場・券種別料金を取得 |
| LivePocket | https://livepocket.jp/ | 検索から 4 公演の日時・会場・券種別料金を取得 |
| TIGET | https://tiget.net/ | 検索から 1 公演、前売／当日券を含む 8 券種を取得 |
| イープラス | https://eplus.jp/ | アーティスト一覧から 1 公演の日時・会場・出演者を取得。料金は公開ページに未掲載 |
| ローチケ | https://l-tike.com/ | アーティストページに現在掲載なし。個別公演の抽出は未検証 |
| Buzzチケ | https://buzz-ticket.com/ | HTTP 403。検索・公演ページの調査と抽出処理は未完了 |

LivePocket は旧 `t.livepocket.jp` がアクセス拒否を返すため、公開されている新サイト `livepocket.jp` を使用します。同じ YOIMACHI 公演の LivePocket／イープラスの購入先をまとめ、12 件の掲載を 11 公演に統合しました。この件数は確認時点の情報であり、現在の掲載・販売状況を保証するものではありません。

## 現在の実装範囲

- 公演一覧、検索、チケットサイト別フィルター、開催日順の並べ替え
- 購入先ごとの料金表示、外部チケットページへのリンク
- 端末に保存するお気に入りと新着の既読管理
- 取得元ごとの未設定・成功・失敗表示
- 15 分間隔の取得ワーカー、初回の既存公演を除いた新着判定
- 同じ日時・会場・タイトルの公演を統合し、購入先を併記（別タイトルの同一公演は自動統合しません）
- Expo Push の端末登録・解除、永続通知キュー、再試行、配信レシートの確認

`server/adapters.mjs` に TicketDive・LivePocket・TIGET・イープラス専用の抽出処理があります。TIGET の不正な JSON-LD と LivePocket の一律 00:00 の値をそのまま使わず、本文の日時を読み取ります。汎用の `schema.org Event / MusicEvent / Festival` の JSON-LD 抽出も残しています。

取得できない料金は「購入先で確認」、時間は「未掲載」と表示します。TicketDive のハロウィン公演では概要と詳細で時間が異なっていたため、その両方を注意書きとして表示します。Buzzチケ、ローチケの個別公演、複数日開催など未対応の形式は、追加の調査・実装が必要です。

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
server/extract.mjs              公演情報の正規化・JSON-LD の抽出
server/adapters.mjs             サイト専用の HTML 抽出処理
server/store.mjs                公演の統合・新着判定・状態の保存
server/notifications.mjs        通知送信・再試行・配信レシート確認
server/sources.json             検証した巡回先・取得元設定
server/sources.example.json     取得元設定を変更する際のコピー元
server/adapters.test.mjs         実ページ項目の抽出・取得状態のテスト
server/workflow.test.mjs        サーバー側のテスト
scripts/smoke-web.mjs           スマホ幅のブラウザー操作テスト
```

アプリはサーバーから公演一覧を取得します。サーバーはチケットサイトを定期確認して状態を保存し、新着があれば登録済みの端末へ Expo Push を通じて通知します。アプリを閉じている間も確認するには、サーバーを継続稼働させる必要があります。

## 実際の取得元を設定する

既定の `server/sources.json` には検証した検索・アーティスト一覧 URL とサイト専用 `adapter` を登録済みです。`npm run server` で定期取得が始まります。`npm run sync` でも単発確認できますが、Buzzチケが取得エラーのため、現状は成功分を保存したうえで終了コード 1 になります。

取得設定を変更する場合は、下記のように無視対象のローカル設定へコピーしてください。既存のローカル設定がある場合は上書きせず、内容を編集します。新しいサイトの追加は、HTML と抽出処理を検証してから行ってください。

```sh
mkdir -p server/data
cp -n server/sources.example.json server/data/sources.local.json
SOURCE_CONFIG=server/data/sources.local.json npm run sync
SOURCE_CONFIG=server/data/sources.local.json npm run server
```

`sync` は、常駐サーバーを停止した状態で実行してください。同一の状態ファイルに複数プロセスで書き込む構成は対応していません。設定ファイルの変更後はサーバーを再起動します。

`listingUrls` を設定したサイトでは、一覧から `eventPathPattern` に一致する公演リンクを毎回見つけて取得します。`eventUrls` だけでは登録済み URL の監視となり、新たな URL の発見はできません。検索結果が HTML に含まれない場合は、公式 API やブラウザーを使うサイト専用アダプターが必要です。

巡回は許可した HTTPS ホストのみで、リダイレクト先もチェックします。1 ページ 2 MB、15 秒、1 サイト 50 公演の上限を設けています。取得できない日時や料金は推測しません。一覧は最大 5 ページまで辿り、おすすめ欄の別アーティストや異なる検索条件は巡回しません。HTML の形式変更や HTTP 200 のアクセス確認画面を、掲載ゼロと誤認しないよう検証します。時差指定のない日本の開催日時は JST として扱います。

初回の完全に成功した取得を基準とし、それまでに見つかった公演は通知しません。失敗が混じった初回でも成功分は表示しますが、基準の確定を保留します。基準確定後に初めて見つかった公演を通知します。既存公演の料金変更や別サイトの購入先追加は通知しません。取得失敗時に以前の情報は削除しないため、設定画面の最終確認と取得状況を確認できます。

会場の表記対応は `venueAliases` で明示します。現在は実ページで確認した YOIMACHI の会場表記 2 種類を同じ会場として扱います。タイトル・日時まで一致する場合だけ統合し、会場名が異なる公演を推測でまとめません。

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
| `npm run test:live` | 実 API に接続した画面・取得状況・API 障害時の表示を検証 |

```sh
npm run typecheck
npm test
EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 npm run build:web
```

抽出、対象アーティストの判定、初回／新着、昼夜公演の区別、複数サイトの統合、API の登録解除、通知失敗と配信レシートを合成フィクスチャーで検証します。実サイト取得は `test:live` と API の取得状況で確認します。実機プッシュ、ストア配布の検証は別途必要です。

`server/fixtures/` には、実ページから抽出した日時・会場・券種などの最小限の HTML と取得元 URL を保存しています。ライブ取得の検証で初回の既存公演の通知キューが 0 件であることも確認しました。実機プッシュとストア配布は未検証です。

ブラウザーの操作テストも用意しています。サンプルの Web ビルドを配信してから別ターミナルで実行します。

```sh
python3 -m http.server 8081 --bind 127.0.0.1 --directory dist
# 別ターミナル。Chromium 導入済みのクラウド環境での例:
CI=1 CHROMIUM_PATH=/usr/bin/chromium npm run test:web
```

Chromium がない環境では `npx playwright install chromium` でブラウザーを導入します。`WEB_TEST_URL` でテスト先、`SCREENSHOT_PATH` でスクリーンショットの保存先を変更できます。検索、詳細、絞り込み、お気に入り・既読の再読み込み後の保存状態を確認します。

実データ画面の検証は、API と `EXPO_PUBLIC_API_URL=http://localhost:3001 npm run web` を起動してから実行します。

```sh
CI=1 CHROMIUM_PATH=/usr/bin/chromium npm run test:live
```

`API_TEST_URL` で API 接続先を指定できます。既定の Web 接続先は `http://localhost:8081` です。`test:live` は現在の取得状況も確認するため、サイトの停止や形式変更があると失敗します。全プラットフォームのバンドル生成は `EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 npx expo export --platform all --max-workers 2` で確認できます。これは実機向けの署名付きバイナリの作成とは異なります。

クラウドの接続許可候補は `ticketdive.com`、`livepocket.jp`、`tiget.net`、`eplus.jp`、`l-tike.com`、`buzz-ticket.com`、Expo 通知 API の `exp.host` です。必要なサブドメインは、実際のリダイレクトや公式 API を調べて追加します。

## 今後の作業

1. Buzzチケの HTTP 403 を解決する公開アクセス方法や提供 API を確認し、検索・公演ページの取得処理を実装する。
2. ローチケで対象公演が掲載された際の個別公演形式と、複数日開催・ページ送りを実ページで追加検証する。
3. 同一公演のタイトルや会場名の表記揺れに対応し、複数サイト間の重複判定を改善する。
4. HTTPS API と永続ストレージを用意し、定期取得・通知の失敗を監視する。
5. iPhone / Android の実機で新着通知・通知解除・通知タップ時の詳細表示を確認する。

このアプリは、ゆるめるモ！および各チケット販売サイトの公式アプリではありません。購入・販売状況の最終確認は、各チケットサイトで行ってください。
