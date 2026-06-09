// アプリ全体で使う設定値
// ──────────────────────────────────────────────
// Google OAuth 2.0 クライアント ID（公開情報。ブラウザに埋め込んで OK）
// クライアントシークレットは絶対に埋め込まない（サーバー側＝Edge Function で保持する）
export const GCAL_CLIENT_ID =
  '672347749731-gfq4k688k31a46ju8qnmi09haoqhbhto.apps.googleusercontent.com'

// ──────────────────────────────────────────────
// Google カレンダー連携の方式切り替えフラグ
// ──────────────────────────────────────────────
// false … 従来のブラウザ専用フロー（暗黙フロー＋GIS サイレント更新）。
//          Edge Function を未デプロイでもそのまま動く（既定）。
// true  … サーバーサイド方式（Supabase Edge Functions）。
//          認可コードフローでリフレッシュトークンを Supabase に保存し、
//          サーバー側で自動更新する。ブラウザを閉じても連携が維持される。
//
// ⚠ true にする前に docs/google-calendar-backend-setup.md の手順
//    （Edge Function のデプロイ・client_secret 登録・テーブル作成）を完了してください。
export const GCAL_USE_BACKEND = false
