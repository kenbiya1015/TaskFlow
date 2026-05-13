# TaskFlow

健美屋 / 整体信玄チーム向けの社内ハブ。スケジュール、タスク、アイデア、SNS ネタ帳、MTメモ、目標・ビジョン、戦略・戦術を 1 つの画面で管理します。

- フロントエンド：React + Vite
- ホスティング：Vercel（静的サイト）
- 永続化：ブラウザ `localStorage`（エクスポート／インポートで端末間移行可）
- 外部連携：Google カレンダー（OAuth 2.0、読み取り専用）

---

## 🚀 デプロイのいちばん速い経路（5 分）

### 1. GitHub にコードをアップロードする

#### A 案：GitHub Desktop を使う（git コマンド不要）

1. [GitHub Desktop](https://desktop.github.com/) をインストール → GitHub アカウントでサインイン
2. アプリ起動 → `File` → `Add Local Repository...` → このフォルダ `C:\TaskFlow` を選択
3. 「This directory does not appear to be a Git repository.」と出るので `create a repository` をクリック
4. 名前を `taskflow` などにして `Create Repository`
5. 左下 `Commit to main` で初回コミット
6. 上部 `Publish repository` → 「Keep this code private」のチェックは任意 → `Publish Repository`

#### B 案：GitHub Web の Upload で済ませる（5 分）

1. https://github.com/new で空のリポジトリを作成（名前：`taskflow` など、Private 推奨）
2. 作成直後のページの `uploading an existing file` リンクをクリック
3. `C:\TaskFlow` の中身（`node_modules` と `dist` を**除いた**もの）をドラッグ＆ドロップ
4. 下までスクロール → `Commit changes`

> 💡 アップロードする内容：`src/`、`index.html`、`package.json`、`package-lock.json`、`vite.config.js`、`vercel.json`、`.gitignore`、`README.md`、`start.bat`。
> `node_modules/`、`dist/`、`.vite/` は不要（Vercel 側で再生成されます）。

#### C 案：Git CLI を使う（あとで使えると便利）

1. https://git-scm.com/download/win から Git for Windows をインストール（既定のままで OK）
2. PowerShell を**いったん閉じて再起動**してから、このフォルダで：

```powershell
git init
git add .
git commit -m "Initial commit: TaskFlow"
git branch -M main
git remote add origin https://github.com/<your-account>/taskflow.git
git push -u origin main
```

> 認証は初回プッシュ時にブラウザで GitHub にサインインして許可するか、Personal Access Token を入力します。

---

### 2. Vercel に接続してデプロイする

1. https://vercel.com/signup → GitHub アカウントでサインアップ（無料 Hobby プランで十分）
2. 上部 `Add New...` → `Project`
3. 「Import Git Repository」の一覧から先ほど作った `taskflow` を `Import`
   - 表示されない場合は `Adjust GitHub App Permissions` で対象リポジトリを許可
4. `Configure Project` 画面：
   - **Framework Preset**：自動で `Vite` が選ばれているはず
   - **Build Command**：`npm run build`（既定でOK）
   - **Output Directory**：`dist`（既定でOK）
   - **Environment Variables**：なし（このアプリはサーバ側 secret を持ちません）
5. `Deploy` をクリック → 1〜2 分で URL（例：`https://taskflow-xxx.vercel.app`）が発行されます

その後、`main` ブランチに push する度に自動で本番デプロイが走ります。

> 💡 独自ドメインを使いたいときは、Vercel のプロジェクト → `Settings` → `Domains` から追加できます。

---

### 3. デプロイ後にやる 3 つのこと

1. **Google カレンダー連携の本番 URL を Google Cloud Console に登録**
   - [Google Cloud Console](https://console.cloud.google.com/) → 該当プロジェクト → `認証情報` → OAuth クライアント ID を開く
   - 「承認済みの JavaScript 生成元」に Vercel の URL（`https://taskflow-xxx.vercel.app`）を追加 → 保存
   - これをやらないと、本番環境で「Googleカレンダー連携」ボタンが OAuth エラーになります
2. **ローカルで作成したデータを移行する**（必要に応じて）
   - ローカル（`http://localhost:5173`）で `設定 → 💾 バックアップ / 復元 → ⬇ エクスポート`
   - 本番 URL を開いて初回ログイン後、同じ画面で **上書き復元** に JSON をアップロード
3. **チームに URL を共有**

---

## ローカル開発

```powershell
npm install
npm run dev          # http://localhost:5173/
```

ビルド確認：

```powershell
npm run build
npm run preview
```

> Windows で `npm` が「スクリプトを読み込めません」と出るときは、PowerShell の実行ポリシー制限です。
> `cmd /c "npm run dev"` でも起動できます。

---

## 📦 リポジトリにコミットすべきファイル

| 含める | パス | 用途 |
|--------|------|------|
| ✅ | `src/` | アプリ本体 |
| ✅ | `index.html` | エントリ HTML |
| ✅ | `package.json` / `package-lock.json` | 依存ロック |
| ✅ | `vite.config.js` | ビルド設定 |
| ✅ | `vercel.json` | Vercel ビルド／SPA リライト設定 |
| ✅ | `.gitignore` | 除外設定 |
| ✅ | `README.md` | このファイル |
| ❌ | `node_modules/` | 依存（Vercel 側で再生成） |
| ❌ | `dist/` | ビルド成果物（Vercel 側で生成） |
| ❌ | `.vite/` | ローカルキャッシュ |
| ❌ | `.env*` / `.vercel/` | ローカル設定・secret |

---

## 💾 データの保存と保護

データはブラウザの `localStorage`（ドメイン単位）に保存されます。
**ドメインやブラウザが変わるとデータは引き継がれません。**

### バックアップ／復元

アプリ内 `設定 → 💾 バックアップ / 復元` から：

- **⬇ エクスポート**：すべてのデータを 1 つの JSON ファイルとしてダウンロード
- **マージ復元**：既存データを保持したまま JSON を読み込み
- **上書き復元**：既存データを破棄してから JSON を読み込み

エクスポートファイルにはスキーマバージョン（`__version`）が含まれており、将来のスキーマ変更時に自動マイグレーションされます。

### 将来 DB に移行する場合

永続化ロジックは `src/lib/storage.js` と `src/hooks/useLocalStorage.js` に集約されています。Supabase / Firebase 等に移行する場合：

1. `useLocalStorage` の中で `localStorage.getItem / setItem` をリモート API に置換
2. `DATA_KEYS` をテーブル / コレクションへマッピング
3. `tf_currentUser` を認証済みユーザー ID にすり替え

スキーマは「キー単位の独立した JSON ツリー」なので、Supabase なら `kv (key text primary key, value jsonb)` テーブル 1 本でも受けられます。

---

## 📅 Google カレンダー連携の準備（任意）

1. https://console.cloud.google.com/ で新規プロジェクトを作成
2. `API とサービス` → `ライブラリ` で **Google Calendar API** を有効化
3. `OAuth 同意画面` を設定（ユーザータイプ：外部、テストユーザーに自分の Google アカウントを追加）
4. `認証情報` → 認証情報を作成 → **OAuth クライアント ID（ウェブ アプリケーション）**
5. 「承認済みの JavaScript 生成元」に開発・本番 URL を**両方**登録
   - `http://localhost:5173`
   - `https://<your-app>.vercel.app`
6. 発行されたクライアント ID を TaskFlow の `設定 → 📅 Google カレンダー連携` または `スケジュール画面の ⚙️` に貼り付け
7. スケジュール画面の「📅 Googleカレンダー連携」ボタンで OAuth 認証 → 今日・明日のイベントが自動表示

> アクセストークンは 1 時間で失効します。「🔄 同期」または再連携で取り直してください。トークンはローカル保存・エクスポート対象外（セキュリティ）。

---

## 🗂 ディレクトリ構成

```
TaskFlow/
├── index.html
├── package.json
├── vite.config.js
├── vercel.json                  Vercel ビルド・SPA リライト・セキュリティヘッダ
├── .gitignore
├── README.md
└── src/
    ├── App.jsx                  ルーティング・サイドバー・ログイン
    ├── App.css / index.css      テーマ
    ├── members.js               メンバー定義（共有定数）
    ├── hooks/useLocalStorage.js
    ├── lib/
    │   ├── googleCalendar.js    OAuth + Calendar API クライアント
    │   └── storage.js           DATA_KEYS、エクスポート/インポート、マイグレーション
    └── components/
        ├── Home.jsx             マイページ（ダッシュボード）
        ├── TodaySchedule.jsx    今日・明日のスケジュール（GCal 統合）
        ├── TaskList.jsx
        ├── Members.jsx
        ├── Ideas.jsx
        ├── SNS.jsx
        ├── MTMemo.jsx           MTメモ + 営業先管理
        ├── Goals.jsx            目標・ビジョン
        ├── BeingGoals.jsx       なりたい自分
        ├── FuturePlans.jsx      今後の取り組み
        ├── Strategy.jsx         戦略・戦術
        └── Settings.jsx         設定・バックアップ・GCal クライアント ID
```

---

## ❓ よくあるつまずき

| 症状 | 原因と対処 |
|------|-----------|
| Vercel ビルドが失敗（`vite: not found`） | `package.json` がコミットされていない、または `package-lock.json` がない。両方を含めて再 push。 |
| デプロイは成功するが画面が真っ白 | ブラウザ DevTools のコンソール確認。多くは `node_modules` を含めて push してしまった or 古い `dist/` を含めてしまったケース。`.gitignore` を見直す。 |
| Google カレンダー連携で `redirect_uri_mismatch` | Cloud Console の「承認済み JavaScript 生成元」に本番 URL を追加していない。 |
| ローカルのデータが本番に移らない | ドメインが違うため localStorage は共有されません。`設定 → バックアップ / 復元` で JSON エクスポート → 本番で上書き復元。 |
| `npm run dev` で「スクリプトを読み込めません」 | PowerShell の実行ポリシー制限。`cmd /c "npm run dev"` で起動するか、`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` を実行。 |
