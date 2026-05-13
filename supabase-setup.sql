-- TaskFlow / heartrust 健美屋 用 Supabase セットアップ SQL
-- ──────────────────────────────────────────────
-- Supabase ダッシュボード → 左メニュー「SQL Editor」→「New query」に貼り付けて
-- 「Run」ボタンを押せばまとめてセットアップできます（冪等：何度実行してもOK）。

-- 1. KVテーブル（key/value 型でアプリ全データを格納）
create table if not exists public.taskflow_kv (
  workspace_id text not null,
  key text not null,
  value jsonb,
  client_id text,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, key)
);

-- 2. updated_at の自動更新トリガー
create or replace function public.taskflow_kv_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_taskflow_kv_touch on public.taskflow_kv;
create trigger trg_taskflow_kv_touch
before insert or update on public.taskflow_kv
for each row execute function public.taskflow_kv_touch_updated_at();

-- 3. Row Level Security
alter table public.taskflow_kv enable row level security;

-- 4. ポリシー：publishable key（anon ロール）からの読み書きを全許可
--    ※ ワークスペース分離はアプリ側で workspace_id を指定して行う論理分離
--    ※ より強い保護が必要なら将来 auth.uid() などで絞る
drop policy if exists "kv_select_all" on public.taskflow_kv;
drop policy if exists "kv_insert_all" on public.taskflow_kv;
drop policy if exists "kv_update_all" on public.taskflow_kv;
drop policy if exists "kv_delete_all" on public.taskflow_kv;

create policy "kv_select_all" on public.taskflow_kv
  for select using (true);
create policy "kv_insert_all" on public.taskflow_kv
  for insert with check (true);
create policy "kv_update_all" on public.taskflow_kv
  for update using (true) with check (true);
create policy "kv_delete_all" on public.taskflow_kv
  for delete using (true);

-- 5. Realtime 配信を有効化（他端末の変更をリアルタイムで受信できるように）
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'taskflow_kv'
  ) then
    execute 'alter publication supabase_realtime add table public.taskflow_kv';
  end if;
end$$;

-- 6. 動作確認用ビュー（任意）：今あるキーの一覧と更新時刻
create or replace view public.taskflow_kv_summary as
select workspace_id, key, jsonb_typeof(value) as value_type,
       length(value::text) as size_bytes, updated_at
from public.taskflow_kv
order by updated_at desc;

-- 完了。アプリ側でアップロードボタンを押せばデータが流れ込みます。
