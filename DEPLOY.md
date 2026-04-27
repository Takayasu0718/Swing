# Vercel デプロイ手順

## 1. Vercel アカウントとプロジェクト作成

1. https://vercel.com/ にアクセス → **GitHub** で Sign Up（推奨：CI連携が楽）
2. ダッシュボードで **「Add New」→「Project」**
3. GitHub 連携を承認 → リポジトリ `Takayasu0718/Swing` を **Import**
4. Framework Preset は自動で **Vite** が選ばれる（`vercel.json` で明示済み）
5. Build / Install / Output の各設定はデフォルトのまま

## 2. 環境変数を登録

「**Environment Variables**」セクションで以下を1つずつ追加（Production / Preview / Development の3つ全てにチェック）：

| Key | Value |
|---|---|
| `VITE_FIREBASE_API_KEY` | （`.env.local` と同じ値） |
| `VITE_FIREBASE_AUTH_DOMAIN` | `swing-4b52f.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `swing-4b52f` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `swing-4b52f.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `1004711448689` |
| `VITE_FIREBASE_APP_ID` | `1:1004711448689:web:e56178938f5c498ba2cbd0` |
| `VITE_FIREBASE_MEASUREMENT_ID` | `G-2M2Y9YDXJJ` |
| `VITE_SEED_DEMO_DATA` | `false` |

> 本番では `VITE_SEED_DEMO_DATA=false` 推奨（モックフレンド/チームを生成しない）。

## 3. Deploy

「**Deploy**」ボタン → 約1分でビルド完了 → `https://<project>.vercel.app` の URL を取得。

## 4. Firebase で Vercel ドメインを許可

匿名ログイン時に `auth/unauthorized-domain` エラーが出るのを防ぐため：

1. Firebase Console → **Authentication** → **Settings** → **承認済みドメイン**
2. 「ドメインを追加」 → Vercel の発行ドメイン（例：`swing-xxx.vercel.app`）を追加

カスタムドメインを後から設定した場合も同様に追加すること。

## 5. 動作確認

1. 発行された URL をブラウザで開く
2. DevTools Console に `[firebase] initialized` `[firebase] auth ready (anonymous) <uid>` が出ること
3. プロフィール登録 → Firestore Console で `users/{uid}` が増えていること
4. 別端末/シークレットで開いて検索→フレンド申請 → リアルタイム同期確認

## 6. 自動デプロイ

`main` ブランチに push すると Vercel が自動でビルド＆再デプロイ。プルリク作成時は Preview URL が発行されます。

## トラブルシュート

| 症状 | 対処 |
|---|---|
| ビルドエラー | Vercel のログを確認。ローカルで `npm run build` が通るか先に検証 |
| `auth/unauthorized-domain` | 手順 4 のドメイン追加を実施 |
| `Missing or insufficient permissions` | Firestore のルールが反映されているか Console で確認 |
| フレンド検索でユーザーが出ない | Firestore に `users` コレクションが存在するか確認、ルールが認証読取を許可しているか確認 |
| 環境変数が反映されない | Vercel ダッシュボードで再 Deploy（Redeploy） |
