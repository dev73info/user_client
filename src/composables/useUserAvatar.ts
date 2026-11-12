import { computed, ref } from 'vue'
import { apiUrl } from '@/api/http'
import { getProfile } from '@/api/settings/profile'
import { useAuthStore } from '@/stores/auth'

/**
 * 工作台账户头像（整站共用一份模块级缓存）：`GET /settings/profile` 的 `avatar_url`。
 *
 * 顶栏用户胶囊自己维护一份（`usePortalSubscription`），这里给图标栏底部的账户按钮用。
 * 头像上传成功后由 `PROFILE_AVATAR_UPDATED_EVENT` 触发 `refresh()`，与顶栏同一口径。
 * 接口失败静默回退首字母，不弹 toast，也不阻塞页面。
 */
const avatarUrl = ref('')
const avatarFailed = ref(false)
/** 已经请求过的 token：同一会话内不重复打接口。 */
let loadedToken = ''

const avatarSrc = computed(() => {
  const url = avatarUrl.value.trim()
  if (!url || avatarFailed.value) {
    return ''
  }
  return apiUrl(url)
})

async function load(token: string) {
  loadedToken = token
  try {
    const profile = await getProfile(token)
    avatarUrl.value = profile.avatar_url ?? ''
  } catch {
    avatarUrl.value = ''
  }
}

export function useUserAvatar() {
  const auth = useAuthStore()

  /** 未登录或同 token 已拉过就跳过。 */
  async function ensureLoaded() {
    if (!auth.token || loadedToken === auth.token) {
      return
    }
    await load(auth.token)
  }

  /** 头像更新后重拉（新的文件名带 uuid，不需要改缓存键）。 */
  async function refresh() {
    if (!auth.token) {
      return
    }
    avatarFailed.value = false
    await load(auth.token)
  }

  /** 图片加载失败：回退首字母，不再反复渲染坏图。 */
  function markFailed() {
    avatarFailed.value = true
  }

  return { avatarSrc, ensureLoaded, refresh, markFailed }
}
