import { useEffect, useRef } from 'react'

export const AUTOSAVE_EVENT = 'tf-autosave-status'

let pendingCount = 0
let savedHideTimer = null

function emit(state) {
  try {
    window.dispatchEvent(new CustomEvent(AUTOSAVE_EVENT, { detail: { state, pending: pendingCount } }))
  } catch {}
}

export function notifySaving() {
  pendingCount++
  if (savedHideTimer) { clearTimeout(savedHideTimer); savedHideTimer = null }
  emit('saving')
}

export function notifySaved() {
  pendingCount = Math.max(0, pendingCount - 1)
  if (pendingCount === 0) {
    if (savedHideTimer) clearTimeout(savedHideTimer)
    emit('saved')
    savedHideTimer = setTimeout(() => {
      savedHideTimer = null
      emit('idle')
    }, 1200)
  }
}

/**
 * useAutoSave — debounce-commit a value to a store.
 *
 * - 1s 後（delayMs）に commit(value) を呼び出す
 * - 入力中は「保存中...」、commit 完了で「保存しました」状態を SaveStatus に通知
 * - アンマウント時に pending を取り消す（commit はキャンセル）
 */
export function useAutoSave(value, commit, delayMs = 1000) {
  const timerRef = useRef(null)
  const isFirstRef = useRef(true)
  const isPendingRef = useRef(false)
  const commitRef = useRef(commit)
  commitRef.current = commit

  useEffect(() => {
    if (isFirstRef.current) {
      isFirstRef.current = false
      return
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!isPendingRef.current) {
      isPendingRef.current = true
      notifySaving()
    }
    timerRef.current = setTimeout(() => {
      isPendingRef.current = false
      try { commitRef.current(value) } catch (e) { console.warn('[useAutoSave] commit failed', e) }
      notifySaved()
    }, delayMs)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (isPendingRef.current) {
        isPendingRef.current = false
        notifySaved()
      }
    }
  }, [])
}

