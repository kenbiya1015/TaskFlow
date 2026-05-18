import { useState, useRef, useEffect } from 'react'
import { useUserScopedStorage, uid } from '../hooks/useLocalStorage'

const CATEGORIES = ['健美屋', '整体', '個人', '成長', '相手ボール', 'その他']
const PRIORITIES = ['A', 'B', 'C', 'D']

const NO_PARTNER = '__none__'

export default function MTMemo({ currentUser }) {
  const [memos, setMemos] = useUserScopedStorage('tf_mtmemos_by_user', currentUser, [])
  const [tasks, setTasks] = useUserScopedStorage('tf_tasks_by_user', currentUser, [])
  const [ideas, setIdeas] = useUserScopedStorage('tf_ideas_by_user', currentUser, [])
  const [partners, setPartners] = useUserScopedStorage('tf_partners_by_user', currentUser, [])

  const [tab, setTab] = useState('memos')

  // memo form state
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [partnerId, setPartnerId] = useState(NO_PARTNER)
  const [filterPartner, setFilterPartner] = useState('all')

  // recording state
  const [recording, setRecording] = useState(false)
  const [recognitionError, setRecognitionError] = useState('')
  const recogRef = useRef(null)
  const interimRef = useRef('')

  const hasSpeech = typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition)

  useEffect(() => () => recogRef.current?.stop?.(), [])

  const toggleRecord = () => {
    if (!hasSpeech) {
      setRecognitionError('このブラウザは音声入力に未対応です（Chrome推奨）')
      return
    }
    if (recording) {
      recogRef.current?.stop()
      setRecording(false)
      return
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SR()
    rec.lang = 'ja-JP'
    rec.continuous = true
    rec.interimResults = true
    interimRef.current = ''

    rec.onresult = e => {
      let finalChunk = ''
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalChunk += r[0].transcript
        else interim += r[0].transcript
      }
      if (finalChunk) {
        setText(prev => (prev ? prev + (prev.endsWith('\n') ? '' : ' ') : '') + finalChunk)
      }
      interimRef.current = interim
    }
    rec.onerror = ev => {
      setRecognitionError(`エラー: ${ev.error}`)
      setRecording(false)
    }
    rec.onend = () => setRecording(false)
    rec.start()
    recogRef.current = rec
    setRecording(true)
    setRecognitionError('')
  }

  const save = () => {
    if (!text.trim() && !title.trim()) return
    setMemos([
      {
        id: uid(),
        title: title.trim() || '無題のMT',
        text: text.trim(),
        partnerId: partnerId === NO_PARTNER ? null : partnerId,
        createdAt: Date.now(),
      },
      ...memos,
    ])
    setText('')
    setTitle('')
    // keep partnerId for batched memos against the same partner
  }

  const removeMemo = id => setMemos(memos.filter(m => m.id !== id))
  const updateMemoPartner = (id, pid) =>
    setMemos(memos.map(m => m.id === id ? { ...m, partnerId: pid === NO_PARTNER ? null : pid } : m))

  const distributeToTask = (memo, category, priority) => {
    setTasks([
      {
        id: uid(),
        text: memo.title,
        category,
        member: currentUser,
        priority,
        due: '',
        done: false,
        createdAt: Date.now(),
        fromMT: memo.id,
        partnerId: memo.partnerId || null,
      },
      ...tasks,
    ])
    setMemos(memos.map(x => x.id === memo.id ? { ...x, addedToTask: priority } : x))
  }

  const distributeToIdea = memo => {
    setIdeas([{
      id: uid(),
      text: `${memo.title}\n${memo.text}`.trim(),
      author: currentUser,
      pinned: false,
      createdAt: Date.now(),
    }, ...ideas])
    alert(`「${memo.title}」をアイデアメモに振り分けました`)
  }

  const partnerById = id => partners.find(p => p.id === id)

  const filteredMemos = filterPartner === 'all'
    ? memos
    : filterPartner === NO_PARTNER
      ? memos.filter(m => !m.partnerId)
      : memos.filter(m => m.partnerId === filterPartner)

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">MTメモ</div>
          <div className="page-subtitle">MEETING　MEMO　·　営業先管理　·　音声入力</div>
        </div>
        <div className="form-row" style={{ margin: 0 }}>
          <button
            className={`category-tab ${tab === 'memos' ? 'active' : ''}`}
            onClick={() => setTab('memos')}
          >📝 メモ</button>
          <button
            className={`category-tab ${tab === 'partners' ? 'active' : ''}`}
            onClick={() => setTab('partners')}
          >🏢 営業先・取引先</button>
        </div>
      </div>

      {tab === 'partners' ? (
        <PartnersTab
          partners={partners}
          setPartners={setPartners}
          memos={memos}
          onOpenMemos={id => { setFilterPartner(id); setTab('memos') }}
        />
      ) : (
        <>
          <div className="mt-record-bar">
            <button className={`btn-record ${recording ? 'recording' : ''}`} onClick={toggleRecord}>
              <span className="record-dot"></span>
              {recording ? '録音停止' : '音声入力 開始'}
            </button>
            <div className="mt-status">
              {recording ? '録音中... 話した内容がテキストに追記されます' : hasSpeech ? '日本語音声入力 ready' : '※ Chrome推奨'}
              {recognitionError && <span style={{ color: 'var(--danger)', marginLeft: 12 }}>{recognitionError}</span>}
            </div>
          </div>

          <div className="card">
            <div className="card-title">新しいMTメモ</div>
            <div className="form-row" style={{ marginBottom: 10 }}>
              <input
                className="text-input"
                placeholder="タイトル（例：定例MT、〇〇商談）"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
              <select
                className="select"
                value={partnerId}
                onChange={e => setPartnerId(e.target.value)}
                style={{ minWidth: 220 }}
              >
                <option value={NO_PARTNER}>営業先なし（社内MT）</option>
                {partners.map(p => <option key={p.id} value={p.id}>🏢 {p.name}</option>)}
              </select>
            </div>
            <textarea
              className="textarea"
              style={{ minHeight: 160 }}
              placeholder="議事録・メモ・気づきを記入。音声入力ボタンで自動文字起こし可能。"
              value={text}
              onChange={e => setText(e.target.value)}
            />
            <div className="form-row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => { setText(''); setTitle('') }}>クリア</button>
              <button className="btn" onClick={save}>保存</button>
            </div>
          </div>

          <div className="form-row" style={{ alignItems: 'center', marginTop: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>営業先で絞り込み：</span>
            <select className="select" value={filterPartner} onChange={e => setFilterPartner(e.target.value)}>
              <option value="all">すべて</option>
              <option value={NO_PARTNER}>社内MT（営業先なし）</option>
              {partners.map(p => <option key={p.id} value={p.id}>🏢 {p.name}</option>)}
            </select>
          </div>

          <div className="divider">過去のメモ {filteredMemos.length}件</div>

          {filteredMemos.length === 0 ? (
            <div className="empty"><div className="empty-icon">∽</div>メモはありません</div>
          ) : (
            filteredMemos.map(m => (
              <DistributeMemo
                key={m.id}
                memo={m}
                partner={partnerById(m.partnerId)}
                partners={partners}
                onRemove={() => removeMemo(m.id)}
                onChangePartner={pid => updateMemoPartner(m.id, pid)}
                onTask={(c, p) => distributeToTask(m, c, p)}
                onIdea={() => distributeToIdea(m)}
              />
            ))
          )}
        </>
      )}
    </div>
  )
}

function PartnersTab({ partners, setPartners, memos, onOpenMemos }) {
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [note, setNote] = useState('')

  const add = () => {
    if (!name.trim()) return
    setPartners([
      { id: uid(), name: name.trim(), contact: contact.trim(), note: note.trim(), createdAt: Date.now() },
      ...partners,
    ])
    setName(''); setContact(''); setNote('')
  }

  const remove = id => {
    if (!confirm('この営業先を削除します。紐付いたメモは「営業先なし」になります。よろしいですか？')) return
    setPartners(partners.filter(p => p.id !== id))
  }

  const update = (id, patch) => setPartners(partners.map(p => p.id === id ? { ...p, ...patch } : p))

  const countFor = id => memos.filter(m => m.partnerId === id).length

  return (
    <>
      <div className="card">
        <div className="card-title">🏢 新しい営業先・取引先</div>
        <div className="form-row">
          <input
            className="text-input"
            placeholder="会社名・店舗名"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
          />
          <input
            className="text-input"
            placeholder="担当者・連絡先（任意）"
            value={contact}
            onChange={e => setContact(e.target.value)}
          />
          <button className="btn" onClick={add}>追加</button>
        </div>
        <textarea
          className="textarea"
          placeholder="メモ・補足（任意：紹介経緯、業種、関係性など）"
          style={{ minHeight: 60, marginTop: 6 }}
          value={note}
          onChange={e => setNote(e.target.value)}
        />
      </div>

      <div className="divider">登録済み {partners.length}件</div>

      {partners.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🏢</div>
          まだ営業先は登録されていません。
        </div>
      ) : (
        <div className="partner-grid">
          {partners.map(p => {
            const c = countFor(p.id)
            return (
              <div key={p.id} className="partner-card">
                <button
                  className="btn-icon"
                  onClick={() => remove(p.id)}
                  style={{ position: 'absolute', top: 8, right: 8 }}
                >×</button>
                <input
                  className="text-input"
                  value={p.name}
                  onChange={e => update(p.id, { name: e.target.value })}
                  style={{ width: '100%', marginBottom: 6, fontWeight: 600, padding: '4px 8px' }}
                />
                <input
                  className="text-input"
                  value={p.contact}
                  placeholder="担当者・連絡先"
                  onChange={e => update(p.id, { contact: e.target.value })}
                  style={{ width: '100%', marginBottom: 6, fontSize: 12, padding: '4px 8px' }}
                />
                <textarea
                  className="textarea"
                  placeholder="メモ"
                  value={p.note || ''}
                  onChange={e => update(p.id, { note: e.target.value })}
                  style={{ minHeight: 50, fontSize: 12, marginBottom: 6 }}
                />
                <div
                  className="partner-memo-count"
                  style={{ cursor: c > 0 ? 'pointer' : 'default' }}
                  onClick={() => c > 0 && onOpenMemos(p.id)}
                >
                  📝 関連MTメモ {c} 件{c > 0 && ' →'}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function DistributeMemo({ memo, partner, partners, onRemove, onChangePartner, onTask, onIdea }) {
  const [showDist, setShowDist] = useState(false)
  const [cat, setCat] = useState('健美屋')

  return (
    <div className="mt-memo">
      <div className="mt-memo-header">
        <div>
          <div className="mt-memo-date">
            {memo.title}
            <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 10 }}>
              {new Date(memo.createdAt).toLocaleString('ja-JP')}
            </span>
            {memo.addedToTask && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 10, padding: '2px 8px', background: 'var(--surface-2)', borderRadius: 999, border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-soft)' }}>タスク追加済み</span>
                <span className={`priority-badge priority-${memo.addedToTask}`} style={{ minWidth: 20, height: 18, fontSize: 10, padding: '0 5px' }}>{memo.addedToTask}</span>
              </span>
            )}
          </div>
          <div style={{ marginTop: 4 }}>
            {partner ? (
              <span className="partner-pill">🏢 {partner.name}</span>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>社内MT</span>
            )}
            <select
              className="select"
              value={memo.partnerId || NO_PARTNER}
              onChange={e => onChangePartner(e.target.value)}
              style={{ fontSize: 11, padding: '2px 6px', marginLeft: 8 }}
            >
              <option value={NO_PARTNER}>営業先なし</option>
              {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <button className="btn btn-small btn-secondary" onClick={() => setShowDist(!showDist)}>振り分け</button>
          <button className="btn-icon" onClick={onRemove} style={{ marginLeft: 4 }}>×</button>
        </div>
      </div>
      <div className="mt-memo-text">
        {memo.text || <em style={{ color: 'var(--text-muted)' }}>本文なし</em>}
      </div>
      {showDist && (
        <div className="mt-distribute">
          <select className="select" value={cat} onChange={e => setCat(e.target.value)}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>軸：</span>
            {PRIORITIES.map(p => (
              <button
                key={p}
                className={`priority-badge priority-${p}`}
                style={{ minWidth: 30, height: 26, borderRadius: 6, fontSize: 12 }}
                onClick={() => onTask(cat, p)}
                title={`優先度 ${p} でタスクに追加`}
              >{p}</button>
            ))}
          </span>
          <button className="btn btn-small btn-secondary" onClick={onIdea}>→ アイデアへ</button>
        </div>
      )}
    </div>
  )
}
