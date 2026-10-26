import { useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

export function useCommunityAccess() {
  const auth = useAuthStore()
  const route = useRoute()
  const router = useRouter()

  function openLogin() {
    void router.push({
      name: 'home',
      query: { modal: 'auth', mode: 'login', redirect_to: route.fullPath },
    })
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
