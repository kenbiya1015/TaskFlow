import { useState, useEffect, useRef } from 'react'
import { queuePush, SYNC_EVENT } from '../lib/cloudSync'

// localStorage を主、Supabase を従とした双方向同期フック
// ──────────────────────────────────────────────
// - 既存コンポーネントは無修正で動作（API は従来と同じ）
// - 値が変わると localStorage に保存 → debounce 後にクラウドへ push
// - Realtime で他端末からの変更を受け取ると、localStorage 更新 → tf-cloud-sync イベント
//   → 当フックが内部状態を再読み込みして再レンダリング

export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key)
      if (stored === null) return initialValue
      return JSON.parse(stored)
    } catch (e) {
      return initialValue
    }
  })

  const isFirstRun = useRef(true)
  const isRemoteUpdate = useRef(false)

  // 値が変わったら localStorage 保存 + クラウドへ push
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch (e) { /* quota */ }

    if (isFirstRun.current) {
      isFirstRun.current = false
      return
    }
    if (isRemoteUpdate.current) {
      // クラウドからの値で setValue した直後 → 再 push しない
      isRemoteUpdate.current = false
      return
    }
    queuePush(key, value)
  }, [key, value])

  // 他端末からの同期：localStorage に書かれた値を読み直して再描画
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.key !== key) return
      try {
        const stored = window.localStorage.getItem(key)
        const next = stored === null ? initialValue : JSON.parse(stored)
        isRemoteUpdate.current = true
        setValue(next)
      } catch { /* ignore */ }
    }
    window.addEventListener(SYNC_EVENT, handler)
    return () => window.removeEventListener(SYNC_EVENT, handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return [value, setValue]
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// ユーザー別データ用ヘルパー
// ──────────────────────────────────────────────
// 集約キー（例: tf_tasks_by_user）に { [user]: data } で保存し、
// 各コンポーネントから見ると useLocalStorage と同じ API でユーザー固有データを扱える。
//
// 使い方:
//   const [tasks, setTasks] = useUserScopedStorage('tf_tasks_by_user', currentUser, [])
//   // tasks は currentUser のタスクのみ
//   setTasks([...]) // currentUser のスロットだけ更新される
//
// 注意：複数ユーザーの同時編集は last-write-wins になります。
// 通常運用では Realtime 同期で十分緩和されますが、稀に競合が起きえます。
export function useUserScopedStorage(aggKey, user, initialValue) {
  const [all, setAll] = useLocalStorage(aggKey, {})
  const value = (all && user && all[user] !== undefined) ? all[user] : initialValue

  const setValue = (next) => {
    if (!user) return
    setAll(prev => {
      const safePrev = (prev && typeof prev === 'object') ? prev : {}
      const current = safePrev[user] !== undefined ? safePrev[user] : initialValue
      const updated = typeof next === 'function' ? next(current) : next
      return { ...safePrev, [user]: updated }
    })
  }

  return [value, setValue]
}
