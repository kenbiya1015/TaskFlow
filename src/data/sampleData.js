// TaskFlow サンプルデータ
// ──────────────────────────────────────────────
// 各 localStorage キーに投入する初期値。restoreSampleData() から使用される。
// 既存のデフォルト値（strategyDefaults.js / Goals.jsx の DEFAULT_VISION 等）と
// 二重で持たず、Strategy は Strategy.jsx 側で初期シードしている。

import { DEFAULT_STRATEGIES } from './strategyDefaults'

const now = Date.now()
const day = 86400000 // 1日のミリ秒

let _orderSeq = 0
const t = (id, text, category, member, priority, dueOffset = null) => ({
  id,
  text,
  category,
  member,
  priority, // A/B/C/D
  due: dueOffset == null ? '' : new Date(now + dueOffset * day).toISOString().slice(0, 10),
  done: false,
  createdAt: now,
  order: ++_orderSeq,
})

// ───── タスク（A=最重要 / B=重要 / C=通常 / D=低） ─────
const SAMPLE_TASKS = [
  // 志村直紀（代表 / プランナー）
  t('sample-task-01', 'ショート動画を1本撮って投稿（朝のルーチン）', 'SNS',   '志村直紀', 'A', 0),
  t('sample-task-02', 'LINEのステップ配信を設定する',                'SNS',   '志村直紀', 'B', 3),
  t('sample-task-03', '健美屋オフィスの営業電話を3件かける',           '健美屋','志村直紀', 'A', 1),
  t('sample-task-04', '整体パッケージの料金プランを再検討',           '整体',  '志村直紀', 'B', 5),
  t('sample-task-05', '今週のMT議題をまとめる',                       '成長',  '志村直紀', 'B', 2),
  t('sample-task-06', '本音トーク動画の台本を3本書き出す',             'SNS',   '志村直紀', 'C', 4),

  // 古澤照彦（運営 / 実務担当）
  t('sample-task-10', '定期購入リストの整理と顧客フォロー',           '健美屋','古澤照彦',     'A', 1),
  t('sample-task-11', '健美屋オフィス向け提案資料の更新',             '健美屋','古澤照彦',     'B', 3),
  t('sample-task-12', '在庫確認・追加発注の手配',                     '健美屋','古澤照彦',     'B', 2),
  t('sample-task-13', '製造現場の動画撮影に立ち会う',                 'SNS',   '古澤照彦',     'C', 6),

  // 有野圭介（サポート / 施術担当）
  t('sample-task-20', '今週の整体予約者にリマインダー送信',           '整体',  '有野圭介',     'A', 0),
  t('sample-task-21', '整体パッケージ顧客のリピート確認連絡',         '整体',  '有野圭介',     'B', 2),
  t('sample-task-22', '施術スペースの清掃・備品チェック',             '整体',  '有野圭介',     'D', 1),
]

// ───── アイデア ─────
const SAMPLE_IDEAS = [
  { id: 'sample-idea-01', text: '製造現場のショート動画シリーズ「健美屋の中の人」',                       author: '志村直紀', pinned: true,  createdAt: now },
  { id: 'sample-idea-02', text: '健美屋オフィスのトライアル1週間プラン（無料サンプル＋アンケート）',     author: '古澤照彦',     pinned: false, createdAt: now - day },
  { id: 'sample-idea-03', text: '整体パッケージ会員に毎月健康食品を1袋プレゼント',                     author: '有野圭介',     pinned: false, createdAt: now - day * 2 },
  { id: 'sample-idea-04', text: 'お客様の変化ビフォーアフター動画（許可制）',                           author: '志村直紀', pinned: true,  createdAt: now - day * 3 },
  { id: 'sample-idea-05', text: 'LINE登録特典：簡単セルフケア動画3本',                                 author: '志村直紀', pinned: false, createdAt: now - day * 5 },
]

// ───── MTメモ ─────
const SAMPLE_MTMEMOS = [
  {
    id: 'sample-memo-01',
    title: '週次戦略MT',
    text:
      '【今週の確認事項】\n' +
      '・ショート動画：志村アカウント毎日／健美屋公式週3本 を継続\n' +
      '・健美屋オフィス：今週中に3件の営業電話\n' +
      '・整体パッケージ：料金プランをシンプル化\n' +
      '\n' +
      '【決定事項】\n' +
      '・動画優先順位は①お客様の変化 ②製造現場 ③本音トーク ④商品紹介\n' +
      '・LINEステップ配信を今週設定',
    partnerId: null,
    createdAt: now - day * 2,
  },
  {
    id: 'sample-memo-02',
    title: '健美屋オフィス 営業戦略MT',
    text:
      '・10社契約で月商30万円のラインを安定化\n' +
      '・トライアル1週間プランで参入障壁を下げる\n' +
      '・顧客の声を動画化して次の営業に活用',
    partnerId: null,
    createdAt: now - day * 5,
  },
]

// ───── 営業先（パートナー） ─────
const SAMPLE_PARTNERS = [
  { id: 'sample-partner-01', name: '株式会社サンプルA', contact: '担当：田中様 / 03-1234-5678',  note: '健美屋オフィス トライアル提案中', createdAt: now - day * 7 },
  { id: 'sample-partner-02', name: '合同会社サンプルB', contact: '担当：佐藤様 / info@sample.jp', note: '次回MT：来週水曜',                createdAt: now - day * 14 },
]

// ───── SNS投稿 ─────
const SAMPLE_SNS = [
  { id: 'sample-sns-01', account: 'shimura', text: '今日のお客様の変化動画（30秒）',         status: '確定',     scheduledFor: '', createdAt: now },
  { id: 'sample-sns-02', account: 'shimura', text: '本音トーク：なぜ健美屋を始めたのか',     status: 'アイデア', scheduledFor: '', createdAt: now - day },
  { id: 'sample-sns-03', account: 'kenbiya', text: '製造現場ライブ：今週の仕込み',           status: 'アイデア', scheduledFor: '', createdAt: now - day * 2 },
  { id: 'sample-sns-04', account: 'seitai',  text: '腰痛改善セルフケア3選',                  status: '確定',     scheduledFor: '', createdAt: now - day * 3 },
]

// ───── 年間目標 ─────
const SAMPLE_YEAR_GOALS = {
  '2026': [
    { id: 'sample-yg-2026-1', text: '月商110万円達成（オフィス10社・定期100人・整体月10件）', done: false },
    { id: 'sample-yg-2026-2', text: '健美屋公式IGフォロワー 3,000 人', done: false },
    { id: 'sample-yg-2026-3', text: 'LINEステップ配信の完成と運用開始',  done: false },
  ],
  '2027': [
    { id: 'sample-yg-2027-1', text: '月商300万円を安定化', done: false },
    { id: 'sample-yg-2027-2', text: '健美屋オフィス 30社', done: false },
  ],
  '2028': [
    { id: 'sample-yg-2028-1', text: '年商1億円の道筋を確立', done: false },
  ],
  '5年後': [
    { id: 'sample-yg-5y-1',   text: '年商10億円規模の体制を構築', done: false },
  ],
  '10年後': [
    { id: 'sample-yg-10y-1',  text: '年商1000億円に向けた基盤整備', done: false },
  ],
}

// ───── 今後の取り組み ─────
const SAMPLE_FUTURE = [
  { id: 'sample-future-01', text: '健美屋オフィス全国展開',         detail: '法人福利厚生としての導入を加速', timeframe: '1〜3年',  category: '事業', status: '構想中', createdAt: now },
  { id: 'sample-future-02', text: 'EC自動化＆定期購入の仕組み化', detail: 'カゴ落ち対策・LTV最大化',         timeframe: '半年〜1年', category: '仕組み', status: '構想中', createdAt: now },
  { id: 'sample-future-03', text: '整体スクール／のれん分け',     detail: '志村メソッドを継承する仲間を育てる', timeframe: '3〜7年',  category: '事業', status: '構想中', createdAt: now },
]

// ───── なりたい自分 ─────
const SAMPLE_BEING = {
  '志村直紀':
    '誰よりも誠実に。\n' +
    '理学療法士 × 整体師 × 健康食品 × 経営者の4軸を、唯一無二の強みとして使い切る。\n' +
    '毎日コツコツ発信して、人の人生に静かな喜びを届け続ける。',
  '古澤照彦':
    '実務の要として、現場と数字の両方を見られる人になる。\n' +
    'お客様への丁寧なフォローで、定期購入のリピート率を最大化する。',
  '有野圭介':
    '一人ひとりに寄り添う施術で、リピートと紹介が自然に生まれる存在になる。',
}

// ───── 全体の戦略・戦術（戦略ページ最上部 & マイページ表示） ─────
const SAMPLE_OVERALL = {
  strategy:
    '志村直紀という人間そのものが起点。\n' +
    '理学療法士 × 整体師 × 健康食品 × 経営者の4軸で唯一無二のポジションを築き、\n' +
    '「売上 → 認知 → 仕組み」の順番で迷わずやり切る。',
  tactics:
    '① 売上を作る（最優先）\n' +
    '② 認知を広げる（毎日コツコツ）\n' +
    '③ 仕組みを作る（並行して少しずつ）\n' +
    '\n' +
    '・月商110万円のラインを早期に確立\n' +
    '・SNS と LINE で「お客様の変化」を中心に発信\n' +
    '・属人化させず、再現できる型に落とし込む',
}

// ───── サンプルデータ全体（key → value） ─────
export const SAMPLE_DATA = {
  tf_tasks: SAMPLE_TASKS,
  tf_ideas: SAMPLE_IDEAS,
  tf_mtmemos: SAMPLE_MTMEMOS,
  tf_partners: SAMPLE_PARTNERS,
  tf_sns: SAMPLE_SNS,
  tf_yearGoals: SAMPLE_YEAR_GOALS,
  tf_future: SAMPLE_FUTURE,
  tf_being: SAMPLE_BEING,
  tf_strategies: DEFAULT_STRATEGIES,
  tf_strategy_overall: SAMPLE_OVERALL,
}
