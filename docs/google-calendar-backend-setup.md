# Google カレンダー連携を「サーバーサイド方式」に切り替える手順

このドキュメントは、Google カレンダー連携を **ブラウザ専用方式** から
**サーバーサイド方式（Supabase Edge Functions）** に切り替えるための手順書です。

初めての方でも進められるように、**1ステップずつ・コピペで** 実行できるように書いています。
途中で分からなくなったら、最後の「困ったときは」を見てください。

---

## これは何をするもの？

| | 今まで（ブラウザ専用方式） | これから（サーバー方式） |
|---|---|---|
| 連携の維持 | Google のログインセッションが切れると再連携が必要 | **ブラウザを閉じても維持される** |
| トークン保存 | ブラウザの中だけ | リフレッシュトークンを **Supabase に安全に保存** |
| 自動更新 | ブラウザが開いている間だけ | **サーバー側で自動更新** |
| client_secret | 使わない | サーバー（Edge Function）だけが保持。ブラウザには出ない |

> **重要**：この手順を **全部終えてから** 最後にアプリの設定フラグを `true` にします。
> フラグが `false`（既定）の間は、これまで通りブラウザ専用方式で普通に動くので、
> 途中まで進めても **アプリが壊れることはありません**。安心して進めてください。

---

## 事前に用意するもの

- **Supabase プロジェクトの管理者権限**（ダッシュボードにログインできること）
  - このアプリのプロジェクト URL：`https://mmlcilbilangcsialwya.supabase.co`
  - プロジェクト ID（ref）：`mmlcilbilangcsialwya`
- **Google Cloud Console の管理者権限**（OAuth クライアントを設定した Google アカウント）
- **PC のターミナル**（Windows なら PowerShell）。CLI を 1 回だけ使います。

所要時間：おおよそ 15〜30 分。

---

## ステップ 1：トークン保存テーブルを作る（SQL を実行）

1. Supabase ダッシュボードを開く → 左メニューの **「SQL Editor」** をクリック。
2. **「New query」** を押す。
3. このリポジトリの **`supabase-gcal-tokens.sql`** の中身を全部コピーして貼り付ける。
4. 右下の **「Run」** を押す。`Success` と出れば完了。

> これで `gcal_tokens` というテーブルができます。
> このテーブルは **RLS（行レベルセキュリティ）で完全にロック** されていて、
> ブラウザからは読めません。Edge Function だけが読み書きできます。

---

## ステップ 2：Google の client_secret を取得し、リダイレクト URI を確認する

1. [Google Cloud Console](https://console.cloud.google.com/) を開く。
2. このアプリの OAuth クライアントを使っているプロジェクトを選ぶ。
3. 左メニュー **「API とサービス」→「認証情報」**。
4. 「OAuth 2.0 クライアント ID」の一覧から、このアプリのクライアント
   （ID が `672347749731-...apps.googleusercontent.com`）をクリック。
5. 種類が **「ウェブ アプリケーション」** であることを確認。
   （ウェブアプリには client_secret があります。）
6. **「承認済みのリダイレクト URI」** に以下の両方があることを確認。無ければ追加して「保存」：
   - `http://localhost:5173/auth/callback`
   - `https://task-flow-khaki-one.vercel.app/auth/callback`
7. 画面右側にある **「クライアント シークレット」** をコピーしてメモ帳などに控える。
   （`GOCSPX-...` のような文字列です。**他人に見せない**。）

> ⚠ client_secret は秘密の鍵です。GitHub やチャット、フロントエンドのコードに
> **絶対に貼らないでください**。次のステップでサーバー（Supabase）にだけ登録します。

---

## ステップ 3：Supabase CLI を入れる

PowerShell で次のどれか1つを実行します（環境に合わせて）。

**Scoop を使っている場合（おすすめ・簡単）**
```powershell
scoop install supabase
```

**npm を使う場合**
```powershell
npm install -g supabase
```

入ったか確認：
```powershell
supabase --version
```
バージョン番号が出れば OK。

> Scoop が無い場合のインストール（PowerShell）：
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> irm get.scoop.sh | iex
> ```

---

## ステップ 4：Supabase にログインして、プロジェクトを紐づける

```powershell
# 1) ブラウザが開いてログインを求められます。許可してください。
supabase login

# 2) このプロジェクトのフォルダ（C:\TaskFlow）で実行：
cd C:\TaskFlow
supabase link --project-ref mmlcilbilangcsialwya
```

`link` のときに「データベースのパスワード」を聞かれることがあります。
Supabase ダッシュボードの **「Project Settings」→「Database」** で確認・リセットできます。

---

## ステップ 5：秘密の鍵（Secrets）をサーバーに登録する

ステップ 2 で控えた client_secret を、Edge Function 用の秘密として登録します。

```powershell
supabase secrets set `
  GOOGLE_CLIENT_ID="672347749731-gfq4k688k31a46ju8qnmi09haoqhbhto.apps.googleusercontent.com" `
  GOOGLE_CLIENT_SECRET="ここにステップ2で控えたclient_secretを貼る"
```

> `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` は **自動で用意される**ので、
> 自分で設定する必要はありません。
>
> 登録できたか確認：
> ```powershell
> supabase secrets list
> ```
> `GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET` が一覧に出れば OK（値は伏せられます）。

---

## ステップ 6：Edge Function をデプロイする

```powershell
supabase functions deploy gcal-oauth --no-verify-jwt
```

- `--no-verify-jwt` は、アプリの publishable キーで関数を呼べるようにするために必要です。
- `Deployed Function gcal-oauth` のように出れば成功。

デプロイ後の関数 URL は次の形になります（確認用）：
```
https://mmlcilbilangcsialwya.supabase.co/functions/v1/gcal-oauth
```

---

## ステップ 7：アプリ側のフラグを ON にして再デプロイ

1. `src/config.js` を開く。
2. 次の行を `false` → `true` に変更：
   ```js
   export const GCAL_USE_BACKEND = true
   ```
3. 変更を保存し、いつもの方法でフロントを再デプロイ（例：Vercel に push）。

> これで初めてサーバー方式が有効になります。
> ローカルで試す場合は `npm run dev` で `http://localhost:5173` を開いてください
> （リダイレクト URI に localhost が登録済みなので動きます）。

---

## ステップ 8：各メンバーが一度だけ「再連携」する

方式が変わったので、各メンバーは **一度だけ連携をやり直す** 必要があります。

1. アプリにログイン → **「設定」** ページを開く。
2. **「📅 Google カレンダー連携」** カードの **連携ボタン**（または「🔌 再連携する」）を押す。
3. Google の同意画面で **自分のアカウントを選んで許可**。
4. アプリに戻り「連携しました」と出れば完了。

一度連携すれば、以降は **ブラウザを閉じてもサーバー側で自動更新** され、
連携が切れにくくなります。

---

## 動作確認

- 設定ページの連携カードに **「● 連携中」** と自分の Gmail アドレスが表示される。
- スケジュール画面に今日・明日の予定が出る。
- ブラウザを完全に閉じて翌日開いても、再連携を求められない。

確認用 SQL（任意・ダッシュボードの SQL Editor）：
```sql
select workspace_id, app_user, email, updated_at from public.gcal_tokens;
```
連携したメンバーの行が見えれば成功です（`refresh_token` は念のため select していません）。

---

## 困ったときは（トラブルシュート）

**「連携に失敗しました（トークン交換に失敗）」と出る**
- ステップ 5 の `GOOGLE_CLIENT_SECRET` が正しいか確認（前後の空白に注意）。
- ステップ 2 のリダイレクト URI が登録されているか確認。
- 設定し直したら、もう一度 `supabase functions deploy gcal-oauth --no-verify-jwt`。

**ボタンを押しても何も起きない / 401・403 になる**
- デプロイ時に `--no-verify-jwt` を付け忘れていないか確認。
- 関数 URL（`.../functions/v1/gcal-oauth`）がブラウザの開発者ツールの
  Network タブで 200 を返しているか確認。

**しばらくしてまた「連携が切れました」と出る**
- Google 側で連携を取り消した、またはパスワード変更などで refresh_token が失効した可能性。
- 設定ページから **もう一度「再連携」** すれば直ります。

**元の方式（ブラウザ専用）に戻したい**
- `src/config.js` の `GCAL_USE_BACKEND` を `false` に戻して再デプロイするだけ。
  テーブルや関数は残しておいて問題ありません。

---

## セキュリティについて（仕組みの補足）

- `refresh_token` は `gcal_tokens` テーブルに保存され、**RLS で anon キーから完全に遮断**。
  読み書きできるのは service_role を使う Edge Function だけです。
- `client_secret` は Edge Function の Secret にのみ保存し、ブラウザには配信されません。
- このアプリは（既存の作りに合わせ）`workspace_id` ＋ メンバー名でトークンを識別します。
  これは厳密なユーザー認証ではなく、既存のワークスペース分離と同じ信頼モデルです。
  より強くしたい場合は、将来 Supabase Auth を導入して `auth.uid()` で
  紐づける拡張が可能です（このドキュメントの範囲外）。
