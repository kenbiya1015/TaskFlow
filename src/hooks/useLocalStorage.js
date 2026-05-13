import { useState, useEffect } from 'react'

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

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch (e) {
      // ignore quota errors
    }
  }, [key, value])

  return [value, setValue]
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
