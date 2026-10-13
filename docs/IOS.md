# iPhoneへ自分でインストールする

[利用者向けREADME](../README.md) / [開発者向けガイド](DEVELOPMENT.md)

現在、GitHubからダウンロードしてそのままインストールできるiPhone版は配布していません。Macから、ご自身のiPhone向けにビルド・署名してインストールします。AndroidのAPKはiPhoneでは使えません。

## 必要なもの

- MacとXcode本体（Mac App Storeからインストール）
- Node.js 24以降
- Apple ID
- Macへ接続できるiPhone

無料Apple IDでも個人用に試せますが、署名は通常7日で期限切れになります。継続利用には再ビルド・再署名が必要です。iPhone実機での動作検証結果は、まだ記録されていません。

## 1. Macの準備

Xcodeを一度開き、利用規約と追加コンポーネントのインストールを完了します。ターミナルで実行してください。

```sh
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
node --version
```

Node.jsがない場合は、[Node.js公式サイト](https://nodejs.org/)から24以降をインストールします。Command Line ToolsだけではiPhone向けのビルドはできません。

## 2. ソースを取得して準備

```sh
mkdir -p "$HOME/Developer"
cd "$HOME/Developer"
git clone https://github.com/WassanBorn72/ylmlm-ticket.git
cd ylmlm-ticket
git checkout v0.6.2
npm ci
npx expo prebuild --platform ios
```

すでにソースを取得している場合は、そのフォルダーを使ってください。CocoaPodsが必要と表示された場合は、Expoの案内に沿ってインストールし、再実行します。

## 3. Apple IDと署名を設定

```sh
open ios/*.xcworkspace
```

Xcodeの **Settings → Accounts** でApple IDを追加します。プロジェクトのアプリターゲットを選び、**Signing & Capabilities** で設定してください。

- **Automatically manage signing**：有効
- **Team**：自分のPersonal Team
- **Bundle Identifier**：`jp.ylmlm.unofficial.ticket`

IDが利用できない場合は、個人用ビルドに限り `jp.yasu.ylmlm.unofficial.ticket` など一意なIDへ変更してください。次にExpo prebuildでプロジェクトを生成し直す場合は、`app.json` の `expo.ios.bundleIdentifier` にも個人用のIDを設定します。公開リポジトリの正式IDを変更する必要はありません。

## 4. iPhoneへインストール

1. iPhoneをMacへ接続し、「このコンピュータを信頼」を選びます。
2. Xcodeの実行先にiPhoneを選びます。
3. **Product → Scheme → Edit Scheme → Run → Info → Build Configuration** を **Release** にします。開発用サーバーへ接続せず単独で起動できるビルドです。
4. Xcodeの実行ボタン（▶︎）を押します。
5. 必要に応じてiPhoneの **設定 → プライバシーとセキュリティ → デベロッパモード** を有効にし、**設定 → 一般 → VPNとデバイス管理** で開発者を信頼します。

インストール後、チケット情報の取得、会場・料金・時間、日付絞り込み、お気に入りの再起動後の保存、地図の起動を確認してください。

## 更新と配布について

更新するときは新しいソースを取得し、同じBundle IdentifierとTeamでビルドします。保存データを残すため、先にアプリを削除する必要はありません。

Apple Developer Programに加入しても、GitHub上のIPAを誰でも無条件にインストールできるようにはなりません。Ad Hoc配布は登録済み端末向けです。このプロジェクトではApp Store／TestFlightへの配布手順は用意していません。
