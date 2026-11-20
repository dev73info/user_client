import { ref } from 'vue'

import { createSupportGuestSession } from '@/api/support'

export const SUPPORT_GUEST_STORAGE_KEY = ['73info', 'support-guest-session', 'v1'].join(':')

type SupportGuestSession = {
  token: string
  display_name: string
}

function readStoredSession(): SupportGuestSession | null {
  try {
    const raw = window.localStorage.getItem(SUPPORT_GUEST_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SupportGuestSession>
    if (typeof parsed.token !== 'string' || !parsed.token.startsWith('73sg_')) return null
    return {
      token: parsed.token,
      display_name: typeof parsed.display_name === 'string' ? parsed.display_name : '访客',
    }
  } catch {
    return null
  }
}

function persistSession(session: SupportGuestSession) {
  try {
    window.localStorage.setItem(SUPPORT_GUEST_STORAGE_KEY, JSON.stringify(session))
  } catch {
    // 隐私模式下只保留当前页面内存态。
  }
}

export function useSupportGuestSession() {
  const session = ref<SupportGuestSession | null>(readStoredSession())
  let pending: Promise<SupportGuestSession> | null = null

  async function ensure(): Promise<string> {
    if (session.value) return session.value.token
    if (!pending) {
      pending = createSupportGuestSession()
        .then((created) => {
          const next = {
            token: created.token,
            display_name: created.display_name,
          }
          session.value = next
          persistSession(next)
          return next
        })
        .finally(() => {
          pending = null
        })
    }
    return (await pending).token
  }

  function clear() {
    session.value = null
    try {
      window.localStorage.removeItem(SUPPORT_GUEST_STORAGE_KEY)
    } catch {
      // 忽略存储不可用。
    }
  }

  return { session, ensure, clear }
}
