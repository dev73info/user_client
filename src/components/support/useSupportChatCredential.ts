import { computed, ref } from 'vue'

import { isSupportGuestToken } from '@/api/support'
import { useAuthStore } from '@/stores/auth'
import { useSupportGuestSession } from './useSupportGuestSession'

export function useSupportChatCredential() {
  const auth = useAuthStore()
  const guest = useSupportGuestSession()
  const token = ref(auth.token.trim() || guest.session.value?.token || '')
  const isGuest = computed(() => isSupportGuestToken(token.value))

  async function ensure(): Promise<string> {
    const accountToken = auth.token.trim()
    if (accountToken) {
      token.value = accountToken
      return accountToken
    }
    const guestToken = await guest.ensure()
    token.value = guestToken
    return guestToken
  }

  return { auth, guest, token, isGuest, ensure }
}
