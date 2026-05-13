import { useState } from 'react'
import { useLocalStorage, uid } from '../hooks/useLocalStorage'

const DEFAULT_VISION = {
  purpose: '健康と美しさを通じて、人の人生に静かな喜びを届ける。',
  mission: '一人ひとりの身体と心に寄り添い、本来の調和を取り戻すお手伝いをする。',
  vision: '十年後、地域に「健美庵あり」と語り継がれる存在になる。',
  values: '誠実・丁寧・継続・温故知新',
}

const DEFAULT_YEARS = ['2026', '2027', '2028', '2029', '2030', '5年後', '10年後']

export default function Goals() {
  const [vision, setVision] = useLocalStorage('tf_vision', DEFAULT_VISION)
  const [yearGoals, setYearGoals] = useLocalStorage('tf_yearGoals', {})
  const [years, setYears] = useLocalStorage('tf_goalYears', DEFAULT_YEARS)

  const [drafts, setDrafts] = useState({})
  const [newYear, setNewYear] = useState('')

  const currentYearStr = String(new Date().getFullYear())

  const setDraft = (y, v) => setDrafts({ ...drafts, [y]: v })

  const addGoal = year => {
    const text = (drafts[year] || '').trim()
    if (!text) return
    const next = { ...yearGoals }
    next[year] = [...(next[year] || []), { id: uid(), text, done: false }]
    setYearGoals(next)
    setDrafts({ ...drafts, [year]: '' })
  }

  const toggleGoal = (year, id) => {
    const next = { ...yearGoals }
    next[year] = (next[year] || []).map(g => g.id === id ? { ...g, done: !g.done } : g)
    setYearGoals(next)
  }

  const removeGoal = (year, id) => {
    const next = { ...yearGoals }
    next[year] = (next[year] || []).filter(g => g.id !== id)
    setYearGoals(next)
  }

  const addYear = () => {
    const label = newYear.trim()
    if (!label) return
    if (years.includes(label)) {
      setNewYear('')
      return
    }
    setYears([...years, label])
    setNewYear('')
  }

  const removeYear = year => {
    const goalCount = (yearGoals[year] || []).length
    const msg = goalCount > 0
      ? `「${year}」を削除します。登録された目標 ${goalCount} 件も一緒に削除されます。よろしいですか？`
      : `「${year}」の列を削除します。よろしいですか？`
    if (!confirm(msg)) return
    setYears(years.filter(y => y !== year))
    if (yearGoals[year]) {
      const next = { ...yearGoals }
      delete next[year]
      setYearGoals(next)
    }
  }

  const updateVision = (k, v) => setVision({ ...vision, [k]: v })

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">目標・ビジョン</div>
          <div className="page-subtitle">PURPOSE　·　MVV　·　YEARLY　GOALS</div>
        </div>
      </div>

      <div className="vision-section">
        <div className="vision-section-title">パーパス</div>
        <div className="vision-section-en">PURPOSE　·　存在意義</div>
        <textarea
          className="textarea"
          style={{ fontSize: 15, lineHeight: 1.85 }}
          value={vision.purpose}
          onChange={e => updateVision('purpose', e.target.value)}
        />
      </div>

      <div className="vision-section">
        <div className="vision-section-title">MVV</div>
        <div className="vision-section-en">MISSION　·　VISION　·　VALUES</div>
        <div className="mvv-grid">
          <div className="mvv-item">
            <div className="mvv-label">Mission</div>
            <div className="mvv-en">使命</div>
            <textarea className="textarea" style={{ minHeight: 100, fontSize: 13 }} value={vision.mission} onChange={e => updateVision('mission', e.target.value)} />
          </div>
          <div className="mvv-item">
            <div className="mvv-label">Vision</div>
            <div className="mvv-en">めざす姿</div>
            <textarea className="textarea" style={{ minHeight: 100, fontSize: 13 }} value={vision.vision} onChange={e => updateVision('vision', e.target.value)} />
          </div>
          <div className="mvv-item">
            <div className="mvv-label">Values</div>
            <div className="mvv-en">大切にする価値観</div>
            <textarea className="textarea" style={{ minHeight: 100, fontSize: 13 }} value={vision.values} onChange={e => updateVision('values', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="vision-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
          <div>
            <div className="vision-section-title">年別目標</div>
            <div className="vision-section-en">YEARLY　GOALS　·　一覧表示</div>
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <input
              className="text-input"
              placeholder="新しい年・期間（例：2031、3年後）"
              value={newYear}
              onChange={e => setNewYear(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addYear()}
              style={{ minWidth: 200 }}
            />
            <button className="btn btn-small" onClick={addYear}>＋ 年を追加</button>
          </div>
        </div>

        <div className="year-rows">
          {years.map(y => {
            const goals = yearGoals[y] || []
            const openCount = goals.filter(g => !g.done).length
            const isCurrent = y === currentYearStr
            return (
              <div key={y} className={`year-row ${isCurrent ? 'current' : ''}`}>
                <div className="year-row-header">
                  <div className={`year-row-title ${isCurrent ? 'current' : ''}`}>
                    {isCurrent ? `${y}年 (今年)` : (/^\d{4}$/.test(y) ? `${y}年` : y)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="year-row-count">{openCount}/{goals.length}</span>
                    <button
                      className="btn-icon"
                      onClick={() => removeYear(y)}
                      title="この年を削除"
                      style={{ padding: '0 6px', fontSize: 13 }}
                    >×</button>
                  </div>
                </div>

                {goals.length === 0 ? (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>目標なし</div>
                ) : (
                  <div className="year-row-goals">
                    {goals.map(g => (
                      <div key={g.id} className={`year-goal-pill ${g.done ? 'done' : ''}`}>
                        <input
                          type="checkbox"
                          className="task-check"
                          style={{ width: 14, height: 14, marginTop: 2 }}
                          checked={g.done}
                          onChange={() => toggleGoal(y, g.id)}
                        />
                        <div className="goal-text">{g.text}</div>
                        <button
                          className="btn-icon"
                          style={{ padding: '0 4px', fontSize: 12 }}
                          onClick={() => removeGoal(y, g.id)}
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="year-row-add">
                  <input
                    placeholder={`${y}の目標を追加...`}
                    value={drafts[y] || ''}
                    onChange={e => setDraft(y, e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addGoal(y)}
                  />
                  <button onClick={() => addGoal(y)}>＋ 追加</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
