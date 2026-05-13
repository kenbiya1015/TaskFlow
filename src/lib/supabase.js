// Supabase クライアント初期化
// ──────────────────────────────────────────────
// publishable key はブラウザに埋め込んで OK（RLS で守る）
// secret key は絶対に埋めない

import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://mmlcilbilangcsialwya.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_UWtT0xkBP2MHWjk_zn__WQ_JPrMoFb6'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { params: { eventsPerSecond: 5 } },
})
