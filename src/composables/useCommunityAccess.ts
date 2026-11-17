import { useRoute, useRouter } from 'vue-router'

import { usePortalAuthPrompt } from '@/composables/usePortalAuthPrompt'
import { useAuthStore } from '@/stores/auth'

export function useCommunityAccess() {
  const auth = useAuthStore()
  const route = useRoute()
  const router = useRouter()
  const { openLogin: promptLogin } = usePortalAuthPrompt()

  function openLogin() {
    void promptLogin()
  }

  function requireLogin(): boolean {
    if (auth.isAuthed && auth.token.trim()) {
      return true
    }
    openLogin()
    return false
  }

  function openRealname() {
    void router.push({ name: 'workbench-realname', query: { redirect_to: route.fullPath } })
  }

  return { auth, openLogin, requireLogin, openRealname }
}
