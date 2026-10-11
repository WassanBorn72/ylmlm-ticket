# GitHub での配布

正式リリースの公開先は https://github.com/WassanBorn72/ylmlm-ticket/releases です。ストアには提出しません。2026年10月11日14:59（日本時間）に、正式版 `v0.2.6` の署名付きAndroid APKを[GitHub Releases](https://github.com/WassanBorn72/ylmlm-ticket/releases/tag/v0.2.6)で公開しました。iPhone向けIPAは作成していません。

[正式版ビルド](https://github.com/WassanBorn72/ylmlm-ticket/actions/runs/38115256222)は成功し、署名検証、APKのSHA-256照合、正式版Application ID、試用版と異なる署名証明書を確認済みです。APKのSHA-256は `3a878e296cdf937b224cbb158172a624cb67b840bd0a0b7a0f85c00fed23c931` です。

## アプリの識別子

| 項目 | 設定値 |
| --- | --- |
| Android Application ID（正式版） | `jp.ylmlm.unofficial.ticket` |
| iOS Bundle ID | `jp.ylmlm.unofficial.ticket` |
| Android Application ID（試用版） | `jp.ylmlm.unofficial.ticket.preview` |
| Expo slug | `ylmlm-unofficial-ticket` |
| URLスキーム | `ylmlm-unofficial-ticket` |

識別子にも `unofficial`（非公式）を含めています。正式版の初回公開後はIDと署名鍵を維持します。

## 公開前に確認すること

1. Android と iPhone の実機から、4 サイトの会場・券種別料金・開場／開演を実ページと照合する。お気に入りの登録・解除と再起動後の保存、会場名からの地図アプリ起動、カレンダーでの月移動・日付の選択・絞り込み解除、新しい名前・非公式表記・ホーム画面のアイコン内のアプリ名・「非公式」の読みやすさ、アプリ内左上の文字なしアイコンも確認する。
2. 初回は新着ゼロ、次回の追加は新着、価格変更・他サイトの重複掲載は新着にしないことを確認する。
3. アプリを閉じると取得しない、復帰／手動更新で取得する、オフラインや取得拒否は前回情報として表示することを確認する。
4. `npm run typecheck`、`npm test`、各 OS のバンドル生成と画面テストを通す。
5. package.json / app.json のバージョンを一致させ、Android versionCode と iOS buildNumber を前回より増やす。`docs/RELEASE_NOTES_TEMPLATE.md` の利用者向け説明を確認し、公開内容に合った変更点を追記する。

## Android：署名付き APK

### 準備済みの署名鍵

2026年10月11日に、所有者のMacで正式版Android署名鍵を作成し、GitHub Actions Secretsへ登録しました。クラウドで以前作成した鍵は使用しません。鍵本体とパスワードはリポジトリに保存していません。

- 形式：JKS
- アルゴリズム：RSA 3072 / SHA256withRSA
- 有効期間：作成日から10,000日
- Alias：`ylmlm-unofficial-release`
- 正式APKの証明書SHA-256：`F9:1C:D7:32:E1:49:21:B6:52:DF:93:61:17:42:A7:B2:4E:A7:24:D4:4D:19:CB:1D:85:93:E6:A4:AA:26:15:52`

Macの `ylmlm-ticket-signing` フォルダーには署名鍵と登録用ファイルが入っています。所有者は暗号化された保管先などへ安全にバックアップしてください。公開・Gitへの追加・チャットへの貼り付けはしないでください。Macで作った鍵を初回公開と以後の更新に使用します。

GitHub からダウンロードしてインストールできる形式です。インストール時には Android の「この提供元のアプリを許可」などの操作が必要です。更新版にも**同じ署名鍵**を使用してください。鍵を失うと既存アプリをそのまま更新できなくなるため、安全な場所にバックアップします。

以下は鍵を新規作成する場合の参考手順です。準備済みの鍵を使う場合は実行不要です。JDK の `keytool` でリリース鍵を作れます。パスワードは対話入力し、コマンド履歴やリポジトリに残しません。

```sh
keytool -genkeypair -v -keystore /安全な保存先/yuru-release.jks -alias yuru-release -keyalg RSA -keysize 3072 -validity 10000
```

GitHub のリポジトリ Settings → Secrets and variables → Actions に、以下の Repository secrets を登録します。値を README・Issue・チャットへ貼り付けないでください。

| Secret 名 | 内容 |
| --- | --- |
| `YLMLM_TICKET_ANDROID_KEYSTORE_BASE64` | keystore ファイルを Base64 エンコードした値 |
| `YLMLM_TICKET_ANDROID_KEYSTORE_PASSWORD` | keystore のパスワード |
| `YLMLM_TICKET_ANDROID_KEY_ALIAS` | 鍵の alias（今回：`ylmlm-unofficial-release`） |
| `YLMLM_TICKET_ANDROID_KEY_PASSWORD` | 鍵のパスワード |

Base64 は暗号化ではありません。変換した内容も秘密情報として取り扱ってください。署名鍵とパスワードはクラウド開発環境の通常変数には入れず、GitHub Actions の Secrets を利用します。

準備と実機確認後、バージョンと一致するタグ（例：`v0.2.6`）を作り、GitHub に push します。

```sh
git tag v0.2.6
git push origin v0.2.6
```

`Android GitHub Release` ワークフローが、テスト → Expo prebuild → 専用鍵で署名した release APK の生成 → 署名検証 → チェックサム生成 → GitHub Release 下書き作成を行います。秘密情報がない場合は停止し、debug 鍵で代用しません。既存タグは Actions の手動実行でも指定できます。同じ下書きの再作成は自動上書きせず失敗するため、既存の内容を確認して扱ってください。

今後のリリースでも下書きには `ylmlm-unofficial-ticket-vバージョン.apk` と `SHA256SUMS.txt` が添付されます。APK を実機にインストールして確認し、リリースノートを書き直してから下書きを公開します。ワークフロー自体は正式公開を自動実行しません。

ローカルでビルドする場合は Android SDK / JDK 17 以降を用意し、以下の変数を安全な方法でプロセスに設定して `npm run build:android` を実行します。

- `YURU_ANDROID_KEYSTORE_PATH`：keystore の絶対パス
- `YURU_ANDROID_KEYSTORE_PASSWORD`
- `YURU_ANDROID_KEY_ALIAS`
- `YURU_ANDROID_KEY_PASSWORD`

生成先は `android/app/build/outputs/apk/release/app-release.apk` です。Gradle ファイルにパスワードの値は書き込みません。`android/` は Expo prebuild の生成物なので Git 管理しません。正式ビルドの前に必要な資格情報がない場合は停止します。

## iPhone：ソースから自分の端末へインストール

GitHub のソース ZIP または git clone から始め、macOS / Xcode と Apple ID を用意します。

```sh
npm ci
npx expo prebuild --platform ios
npx expo run:ios --device
```

必要に応じて生成された `ios/` の workspace を Xcode で開き、Signing & Capabilities で自分の Team を選びます。個人用無料署名の場合は、bundle identifier を自分専用の一意な名前に変更する必要があることがあります。端末の Developer Mode と署名の信頼設定を行い、接続した端末へビルドします。

無料 Apple ID による個人用インストールの署名は通常 7 日で期限切れになり、再ビルド／再署名が必要です。公開された IPA を誰でも GitHub から取得してそのままインストールできる仕組みではありません。

有料 Apple Developer Program の Ad Hoc 署名を利用する場合も、IPA は provisioning profile に登録済みの端末だけにインストールできます。プログラムへの加入だけで一般向け無制限配布が可能になるわけではありません。証明書や profile はリポジトリに追加しません。このプロジェクトはストア提出・TestFlight の手順を含めません。

## 更新方法

Android は Releases から次の APK を取得して同じ署名で上書きインストールします。iPhone の個人用ビルドは新しいソースを取得して再ビルドします。アプリから GitHub を監視する自動更新や OTA 配信は実装していません。
