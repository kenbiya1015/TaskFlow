import { useState, useEffect } from 'react'
import { useUserScopedStorage, uid } from '../hooks/useLocalStorage'
import { DEFAULT_STRATEGIES } from '../data/strategyDefaults'

export const STRATEGY_CATEGORIES = [
  { id: 'kenbiya_office',   name: '健美屋オフィス', emoji: '🏢', color: '#2f6fed' },
  { id: 'kenbiya_business', name: '健美屋ビジネス', emoji: '💼', color: '#1f9e6a' },
  { id: 'sns',              name: 'SNS',            emoji: '📱', color: '#d97706' },
  { id: 'seitai',           name: '整体',           emoji: '🩺', color: '#a52663' },
  { id: 'other',            name: 'その他',         emoji: '📁', color: '#4a5160' },
]

function emptyEntry() {
  return { strategy: '', tactics: [] }
}

const DEFAULT_OVERALL = {
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

export default function Strategy({ currentUser }) {
  const [overall, setOverall] = useUserScopedStorage('tf_strategy_overall_by_user', currentUser, DEFAULT_OVERALL)
  const [data, setData] = useUserScopedStorage('tf_strategies_by_user', currentUser, DEFAULT_STRATEGIES)
  const [drafts, setDrafts] = useState({})

  // 既存ユーザーが空オブジェクト {} を持っている場合のみ、初期データを投入する
  useEffect(() => {
    if (data && typeof data === 'object' && Object.keys(data).length === 0) {
      setData(DEFAULT_STRATEGIES)
    }
    if (overall && typeof overall === 'object' && !overall.strategy && !overall.tactics) {
      setOverall(DEFAULT_OVERALL)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const get = id => data[id] || emptyEntry()

  const updateStrategy = (id, text) => {
    setData({ ...data, [id]: { ...get(id), strategy: text } })
  }

  const setDraft = (id, v) => setDrafts({ ...drafts, [id]: v })

  const addTactic = id => {
    const t = (drafts[id] || '').trim()
    if (!t) return
    const e = get(id)
    setData({
      ...data,
      [id]: { ...e, tactics: [...(e.tactics || []), { id: uid(), text: t, done: false }] },
    })
    setDrafts({ ...drafts, [id]: '' })
  }

  const toggleTactic = (id, tid) => {
    const e = get(id)
    setData({
      ...data,
      [id]: { ...e, tactics: (e.tactics || []).map(t => t.id === tid ? { ...t, done: !t.done } : t) },
    })
  }

  const removeTactic = (id, tid) => {
    const e = get(id)
    setData({
      ...data,
      [id]: { ...e, tactics: (e.tactics || []).filter(t => t.id !== tid) },
    })
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">戦略・戦術</div>
          <div className="page-subtitle">STRATEGY　·　TACTICS　·　カテゴリ別</div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.7 }}>
        🧭 <strong>戦略</strong>は「大きな方向性・なぜそれをやるのか」、
        ⚙️ <strong>戦術</strong>は「具体的にいつ・なにをやるか」を分けて書き留めます。
      </div>

      <div className="strategy-card strategy-overall">
        <div className="strategy-card-header" style={{ borderLeftColor: 'var(--accent)' }}>
          <div className="strategy-cat-name">
            <span style={{ fontSize: 22, marginRight: 8 }}>🌐</span>
            全体の戦略・戦術
          </div>
          <div className="strategy-cat-count">マイページに表示</div>
        </div>
        <div className="strategy-body">
          <div className="strategy-block">
            <div className="strategy-block-label">🧭 全体の戦略</div>
            <textarea
              className="textarea"
              style={{ minHeight: 120, fontSize: 14 }}
              placeholder="事業全体としての方向性・哲学・大きな勝ち筋..."
              value={overall.strategy || ''}
              onChange={ev => setOverall({ ...overall, strategy: ev.target.value })}
            />
          </div>
          <div className="strategy-block">
            <div className="strategy-block-label">⚙️ 全体の戦術</div>
            <textarea
              className="textarea"
              style={{ minHeight: 120, fontSize: 14 }}
              placeholder="今やること・優先順位・具体的アクション..."
              value={overall.tactics || ''}
              onChange={ev => setOverall({ ...overall, tactics: ev.target.value })}
            />
          </div>
        </div>
      </div>

      {STRATEGY_CATEGORIES.map(cat => {
        const e = get(cat.id)
        const open = (e.tactics || []).filter(t => !t.done).length
        const total = (e.tactics || []).length
        return (
          <div key={cat.id} className="strategy-card">
            <div className="strategy-card-header" style={{ borderLeftColor: cat.color }}>
              <div className="strategy-cat-name">
                <span style={{ fontSize: 22, marginRight: 8 }}>{cat.emoji}</span>
                {cat.name}
              </div>
              <div className="strategy-cat-count">戦術 {open}/{total}</div>
            </div>

            <div className="strategy-body">
              <div className="strategy-block">
                <div className="strategy-block-label">🧭 戦略（方向性）</div>
                <textarea
                  className="textarea"
                  style={{ minHeight: 90, fontSize: 14 }}
                  placeholder={`${cat.name} の方向性・狙い・大事にしたい価値観...`}
                  value={e.strategy}
                  onChange={ev => updateStrategy(cat.id, ev.target.value)}
                />
              </div>

              <div className="strategy-block">
                <div className="strategy-block-label">⚙️ 戦術（具体的な行動）</div>
                <div className="form-row" style={{ marginBottom: 8 }}>
                  <input
                    className="text-input"
                    placeholder="具体的な行動を追加..."
                    value={drafts[cat.id] || ''}
                    onChange={ev => setDraft(cat.id, ev.target.value)}
                    onKeyDown={ev => ev.key === 'Enter' && addTactic(cat.id)}
                  />
                  <button className="btn btn-small" onClick={() => addTactic(cat.id)}>＋ 追加</button>
                </div>
                {(e.tactics || []).length === 0 ? (
                  <div className="empty" style={{ padding: 14, fontSize: 12 }}>戦術はまだありません</div>
                ) : (
                  <div className="strategy-tactics">
                    {(e.tactics || []).map(t => (
                      <div key={t.id} className={`year-goal-pill ${t.done ? 'done' : ''}`}>
                        <input
                          type="checkbox"
                          className="task-check"
                          style={{ width: 14, height: 14, marginTop: 2 }}
                          checked={t.done}
                          onChange={() => toggleTactic(cat.id, t.id)}
                        />
                        <div className="goal-text">{t.text}</div>
                        <button
                          className="btn-icon"
                          style={{ padding: '0 4px', fontSize: 12 }}
                          onClick={() => removeTactic(cat.id, t.id)}
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
