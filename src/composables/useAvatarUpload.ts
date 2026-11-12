import { onBeforeUnmount, onMounted, ref } from 'vue'
import { TMessage } from 'ui_73info'
import { uploadProfileAvatar } from '@/api/settings/profile'
import { useUserAvatar } from '@/composables/useUserAvatar'
import { dispatchProfileAvatarUpdated, PROFILE_AVATAR_UPDATED_EVENT } from '@/shared/profileEvents'
import { useAuthStore } from '@/stores/auth'

const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
/** 后端头像上限 2MB。 */
const AVATAR_MAX_BYTES = 2 * 1024 * 1024

/**
 * 「点头像换图」的整套交互：展示走 `useUserAvatar`（与顶栏 / 左栏共用缓存），
 * 选文件后本地校验类型与大小，上传成功即刷新并广播，失败只提示不阻塞页面。
 */
export function useAvatarUpload() {
  const auth = useAuthStore()
  const { avatarSrc, ensureLoaded, refresh, markFailed } = useUserAvatar()
  const inputRef = ref<HTMLInputElement | null>(null)
  const uploading = ref(false)

  function pick() {
    if (uploading.value) {
      return
    }
    inputRef.value?.click()
  }

  async function onPicked(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0] ?? null
    // 清掉选择的文件，选同一张也能再次触发 change
    input.value = ''
    if (!file || uploading.value) {
      return
    }
    if (!AVATAR_TYPES.includes(file.type)) {
      TMessage.warning('头像仅支持 PNG、JPG、WebP 或 GIF 图片')
      return
    }
    if (file.size > AVATAR_MAX_BYTES) {
      TMessage.warning('头像文件请控制在 2MB 以内')
      return
    }

    uploading.value = true
    try {
      await uploadProfileAvatar(auth.token, file)
      await refresh()
      dispatchProfileAvatarUpdated()
      TMessage.success('头像已更新')
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '上传头像失败')
    } finally {
      uploading.value = false
    }
  }

  function handleUpdated() {
    void refresh()
  }

  onMounted(() => {
    void ensureLoaded()
    window.addEventListener(PROFILE_AVATAR_UPDATED_EVENT, handleUpdated)
  })

  onBeforeUnmount(() => {
    window.removeEventListener(PROFILE_AVATAR_UPDATED_EVENT, handleUpdated)
  })

  return { avatarSrc, markFailed, inputRef, uploading, pick, onPicked }
}
