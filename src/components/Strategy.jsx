import { useState, useEffect } from 'react'
import { useUserScopedStorage, uid } from '../hooks/useLocalStorage'
import { DEFAULT_STRATEGIES, DEFAULT_OVERALL } from '../data/strategyDefaults'

export const STRATEGY_CATEGORIES = [
  { id: 'kenbiya_office',   name: '健美屋オフィス', emoji: '🏢', color: '#2f6fed' },
  { id: 'kenbiya_business', name: '健美屋ビジネス', emoji: '💼', color: '#1f9e6a' },
  { id: 'sns',              name: 'SNS',            emoji: '📱', color: '#d97706' },
  { id: 'seitai',           name: '整体',           emoji: '🩺', color: '#a52663' },
  { id: 'other',            name: 'その他',         emoji: '📁', color: '#4a5160' },
]

const PALETTE = ['#2f6fed', '#1f9e6a', '#d97706', '#a52663', '#4a5160', '#9333ea', '#0891b2', '#dc2626', '#65a30d', '#0d9488']

function emptyEntry() {
  return { strategy: '', tactics: [] }
}

export default function Strategy({ currentUser }) {
  const [overall, setOverall] = useUserScopedStorage('tf_strategy_overall_by_user', currentUser, DEFAULT_OVERALL)
  const [data, setData] = useUserScopedStorage('tf_strategies_by_user', currentUser, DEFAULT_STRATEGIES)
  const [categories, setCategories] = useUserScopedStorage('tf_strategy_categories_by_user', currentUser, STRATEGY_CATEGORIES)
  const [drafts, setDrafts] = useState({})
  const [editingCatId, setEditingCatId] = useState(null)

  // 新しいカテゴリ追加フォーム
  const [showNewCat, setShowNewCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatEmoji, setNewCatEmoji] = useState('📌')
  const [newCatColor, setNewCatColor] = useState(PALETTE[0])

  // 既存ユーザーが空オブジェクト {} を持っている場合のみ、初期データを投入する
  useEffect(() => {
    if (data && typeof data === 'object' && Object.keys(data).length === 0) {
      setData(DEFAULT_STRATEGIES)
    }
    if (overall && typeof overall === 'object' && !overall.strategy && !overall.tactics) {
      setOverall(DEFAULT_OVERALL)
    }
    if (!Array.isArray(categories) || categories.length === 0) {
      setCategories(STRATEGY_CATEGORIES)
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

  // カテゴリ操作
  const addCategory = () => {
    if (!newCatName.trim()) return
    const cat = {
      id: 'cat-' + uid(),
      name: newCatName.trim(),
      emoji: newCatEmoji || '📌',
      color: newCatColor,
    }
    setCategories([...(categories || []), cat])
    setNewCatName('')
    setNewCatEmoji('📌')
    setNewCatColor(PALETTE[0])
    setShowNewCat(false)
  }

  const updateCategory = (id, patch) => {
    setCategories((categories || []).map(c => c.id === id ? { ...c, ...patch } : c))
  }

  const removeCategory = (id) => {
    if (!confirm('このカテゴリを削除します。中の戦略・戦術データも消えます。よろしいですか？')) return
    setCategories((categories || []).filter(c => c.id !== id))
    const next = { ...data }
    delete next[id]
    setData(next)
  }

  const cats = Array.isArray(categories) && categories.length > 0 ? categories : STRATEGY_CATEGORIES

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">戦略・戦術</div>
          <div className="page-subtitle">STRATEGY　·　TACTICS　·　カテゴリ別</div>
        </div>
        <button
          className="btn btn-small btn-secondary"
          onClick={() => setShowNewCat(s => !s)}
        >{showNewCat ? '閉じる' : '＋ カテゴリ追加'}</button>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.7 }}>
        🧭 <strong>戦略</strong>は「大きな方向性・なぜそれをやるのか」、
        ⚙️ <strong>戦術</strong>は「具体的にいつ・なにをやるか」を分けて書き留めます。
      </div>

      {showNewCat && (
        <div className="card">
          <div className="card-title">＋ 新しいカテゴリ</div>
          <div className="form-row" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              className="text-input"
              style={{ width: 70, textAlign: 'center', flex: 'none' }}
              value={newCatEmoji}
              onChange={e => setNewCatEmoji(e.target.value)}
              placeholder="📌"
              maxLength={4}
            />
            <input
              className="text-input"
              placeholder="カテゴリ名（例：研究開発）"
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCategory()}
            />
            <div className="strategy-color-palette">
              {PALETTE.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`strategy-color-dot ${newCatColor === c ? 'on' : ''}`}
                  style={{ background: c }}
                  onClick={() => setNewCatColor(c)}
                  title={c}
                  aria-label={`色 ${c}`}
                />
              ))}
            </div>
            <button className="btn" onClick={addCategory}>追加</button>
          </div>
        </div>
      )}

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

      {cats.map(cat => {
        const e = get(cat.id)
        const isEditing = editingCatId === cat.id
        return (
          <div key={cat.id} className="strategy-card">
            <div className="strategy-card-header" style={{ borderLeftColor: cat.color }}>
              <div className="strategy-cat-name" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                {isEditing ? (
                  <>
                    <input
                      className="text-input"
                      style={{ width: 60, textAlign: 'center', flex: 'none', fontSize: 18 }}
                      value={cat.emoji}
                      onChange={ev => updateCategory(cat.id, { emoji: ev.target.value })}
                      maxLength={4}
                    />
                    <input
                      className="text-input"
                      style={{ flex: 1, minWidth: 120, fontSize: 15, fontWeight: 700 }}
                      value={cat.name}
                      onChange={ev => updateCategory(cat.id, { name: ev.target.value })}
                    />
                    <div className="strategy-color-palette">
                      {PALETTE.map(c => (
                        <button
                          key={c}
                          type="button"
                          className={`strategy-color-dot ${cat.color === c ? 'on' : ''}`}
                          style={{ background: c }}
                          onClick={() => updateCategory(cat.id, { color: c })}
                          aria-label={`色 ${c}`}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 22 }}>{cat.emoji}</span>
                    <span>{cat.name}</span>
                  </>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  className="btn btn-small btn-secondary"
                  onClick={() => setEditingCatId(isEditing ? null : cat.id)}
                  title={isEditing ? '編集を終了' : 'タイトル・アイコン・色を編集'}
                >{isEditing ? '完了' : '✏️'}</button>
                {isEditing && (
                  <button
                    className="btn-icon"
                    onClick={() => removeCategory(cat.id)}
                    title="カテゴリを削除"
                  >×</button>
                )}
              </div>
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
