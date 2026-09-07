import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useAuthStore } from '@/stores/auth'
import { AUTH_TOKEN_STORAGE_KEY } from '@/shared/auth/storage'

const OBSOLETE_TOKEN_KEY = 'dev_auth_token_73hub'

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    localStorage.removeItem(OBSOLETE_TOKEN_KEY)
  })

  it('clears the user token on logout', () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'user-token')
    localStorage.setItem(OBSOLETE_TOKEN_KEY, 'obsolete-token')

    const auth = useAuthStore()
    auth.hydrate()
    auth.logout()

    expect(auth.token).toBe('')
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(OBSOLETE_TOKEN_KEY)).toBeNull()
  })

  it('removes obsolete developer token storage instead of restoring it', () => {
    localStorage.setItem(OBSOLETE_TOKEN_KEY, 'obsolete-token')

    const auth = useAuthStore()
    auth.hydrate()

    expect(auth.token).toBe('')
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(OBSOLETE_TOKEN_KEY)).toBeNull()

    auth.logout()
  })
})
