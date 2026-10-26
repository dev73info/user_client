import { ref } from 'vue'

import { updateProfile } from '@/api/settings'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

export function useAccountUsername() {
  const auth = useAuthStore()
  const newUsername = ref('')
  const usernameLoading = ref(false)
  const usernameDialogVisible = ref(false)
  const usernameError = ref('')

  function showError(message: string) {
    usernameError.value = message
    TMessage.error(message)
  }

  function applyUsername(username: string) {
    newUsername.value = username
  }

  function openUsernameDialog() {
    newUsername.value = auth.username
    usernameError.value = ''
    usernameDialogVisible.value = true
  }

  async function updateUsername() {
    if (!auth.isAuthed) {
      showError('请先登录后修改用户名')
      return
    }
    const username = newUsername.value.trim()
    if (!username) {
      showError('请输入一个新的用户名')
      return
    }
    if (username === auth.username) {
      usernameError.value = ''
      TMessage.info('用户名未发生变化')
      return
    }

    usernameLoading.value = true
    usernameError.value = ''
    try {
      const profile = await updateProfile(auth.token, { new_username: username })
      if (!profile.token) {
        throw new Error('改名后未收到新会话，请使用新用户名重新登录')
      }
      await auth.applyExternalSession({ token: profile.token, username: profile.username })
      newUsername.value = profile.username
      usernameDialogVisible.value = false
      TMessage.success('用户名已更新，后续请使用新用户名登录')
    } catch (err) {
      showError(err instanceof Error ? err.message : '修改用户名失败')
    } finally {
      usernameLoading.value = false
    }
  }

  return {
    newUsername,
    usernameLoading,
    usernameDialogVisible,
    usernameError,
    applyUsername,
    openUsernameDialog,
    updateUsername,
  }
}
