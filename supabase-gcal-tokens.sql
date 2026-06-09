-- TaskFlow / heartrust 健美屋 用 Google カレンダー リフレッシュトークン保管テーブル
-- ──────────────────────────────────────────────
-- サーバーサイド方式（Supabase Edge Functions）で使うテーブルです。
-- Supabase ダッシュボード → 左メニュー「SQL Editor」→「New query」に貼り付けて
-- 「Run」を押してください（冪等：何度実行してもOK）。
--
-- ⚠ セキュリティ重要ポイント
--   ・このテーブルは RLS を有効にし、ポリシーを一切作りません。
--     → publishable（anon）キーからは読み書き「全拒否」になります。
--   ・アクセスできるのは service_role キーを使う Edge Function だけ（RLS をバイパス）。
--   ・refresh_token は機密情報。絶対にブラウザへ出さないための構成です。
--   ・このテーブルは Realtime 配信に追加しないでください（taskflow_kv とは別物）。

create table if not exists public.gcal_tokens (
  workspace_id  text not null,
  app_user      text not null,           -- アプリ内のメンバー名（currentUser）
  refresh_token text not null,
  email         text,
  updated_at    timestamptz not null default now(),
  primary key (workspace_id, app_user)
);

-- RLS を有効化（ポリシーを作らない＝ anon からは完全に不可視）
alter table public.gcal_tokens enable row level security;

-- 念のため：もし過去に許可ポリシーを作っていたら剥がす
drop policy if exists "gcal_tokens_select_all" on public.gcal_tokens;
drop policy if exists "gcal_tokens_insert_all" on public.gcal_tokens;
drop policy if exists "gcal_tokens_update_all" on public.gcal_tokens;
drop policy if exists "gcal_tokens_delete_all" on public.gcal_tokens;

-- 完了。Edge Function（gcal-oauth）をデプロイすれば、この表へ自動で保存されます。
