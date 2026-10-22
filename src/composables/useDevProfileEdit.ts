/**
 * 「编辑简介」弹窗：草稿、保存与保存后的整页重载。
 *
 * 简介走的是 `PUT /settings/profile`（用户名原样带回，只改 `profile_description`），
 * 保存成功后重载公开档案，头部才会换成新简介。
 */
import { ref } from 'vue'
import { TMessage } from 'ui_73info'

import { updateProfile } from '@/api/settings'
import { useAuthStore } from '@/stores/auth'

export function useDevProfileEdit(options: { reload: () => Promise<void> }) {
  const auth = useAuthStore()

  const dialogVisible = ref(false)
  const descriptionDraft = ref('')
  const saving = ref(false)

  function editProfile(currentDescription: string) {
    descriptionDraft.value = currentDescription
    dialogVisible.value = true
  }

  async function saveProfile() {
    if (!auth.token || saving.value) {
      return
    }
    saving.value = true
    try {
      await updateProfile(auth.token, auth.username, descriptionDraft.value)
      dialogVisible.value = false
      await options.reload()
      TMessage.success('个人简介已更新')
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '更新个人简介失败')
    } finally {
      saving.value = false
    }
  }

  return {
    dialogVisible,
    descriptionDraft,
    saving,
    editProfile,
    saveProfile,
  }
}
