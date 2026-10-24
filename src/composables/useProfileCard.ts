import { computed, onBeforeUnmount, ref } from 'vue'

import { TMessage } from 'ui_73info'

import { listAvailableCoupons, type CouponItem } from '@/api/coupons'
import { apiUrl } from '@/api/http'
import { getProfile } from '@/api/settings'
import { useAvatarCrop } from '@/composables/useAvatarCrop'
import { useAvatarCropModalBindings } from '@/composables/useAvatarCropModalBindings'
import { useAuthStore } from '@/stores/auth'

/** 原图上限：超过就不进裁剪（先缩图，否则 blob 与 canvas 都会跟着重）。 */
const AVATAR_CROP_MAX_SOURCE_SIZE = 8 * 1024 * 1024

type UseProfileCardOptions = {
  /** 刷新按钮顺带重取的两路需求侧数据：归各自的需求域，这里只负责跟券包 / 资料一起 await。 */
  reloadRequirements: () => Promise<void>
  reloadConversations: () => Promise<void>
}

/**
 * 总览头像卡这一块：资料（头像 / 邮箱 / 官方活动订阅）与券包的取数、顶部几个展示派生，
 * 以及头像的**选图入口**（校验文件类型与大小 → 交给 `useAvatarCrop`）。
 *
 * 裁剪本身（缩放 / 拖拽 / 边界钳制 / Canvas 出图 / 上传）仍在 `useAvatarCrop`，
 * 弹窗挂点仍由 `useAvatarCropModalBindings` 一行铺平；这里只多接了两头：
 * 1. `<input type=file>` 的选图动作（原先散在视图里，连带三条文件校验的文案）；
 * 2. `onUploaded` 的上传后回写（清失败集合 + 换缓存键，让顶部那颗头像重新拉图）。
 *
 * 取数**不在 `onMounted` 里发**：视图那条首屏串行链显式调用 `loadProfile` / `loadCoupons`，
 * 请求次数才钉得住（各 1 次），刷新按钮也才管得到它们。
 */
export function useProfileCard(options: UseProfileCardOptions) {
  const auth = useAuthStore()

  // ---- 资料 ----
  const profileAvatarUrl = ref('')
  /** 头像缓存键：上传成功 / 离页时换一个，`apiUrl` 后面拼 `?v=` 破浏览器缓存。 */
  const profileAvatarCacheKey = ref(0)
  const profileAvatarInput = ref<HTMLInputElement | null>(null)
  const profileEmail = ref('')
  const subscriptionOfficialActivity = ref(false)
  /** 拉图失败的头像地址：进集合就不再渲染 `<img>`，免得每帧重试一次 404。 */
  const failedProfileAvatarUrls = ref<Set<string>>(new Set())

  // ---- 券包 ----
  const coupons = ref<CouponItem[]>([])
  const loading = ref(false)
  const usableCouponCount = computed(
    () => coupons.value.filter((item) => item.status !== 'used').length,
  )

  // ---- 展示派生 ----
  const accountEmailLabel = computed(() => profileEmail.value || '未绑定邮箱')
  const profileAvatarSrc = computed(() => {
    const avatarUrl = profileAvatarUrl.value.trim()
    if (!avatarUrl || failedProfileAvatarUrls.value.has(avatarUrl)) {
      return ''
    }

    const src = apiUrl(avatarUrl)
    if (!profileAvatarCacheKey.value) {
      return src
    }

    return `${src}${src.includes('?') ? '&' : '?'}v=${profileAvatarCacheKey.value}`
  })
  const profileInitial = computed(() => Array.from(auth.username || '用')[0] ?? '用')
  const timeGreeting = computed(() => {
    const hour = new Date().getHours()
    if (hour < 6) return '夜深了，注意休息'
    if (hour < 11) return '早上好，开启美好的一天'
    if (hour < 14) return '中午好，记得按时吃饭'
    if (hour < 18) return '下午好，继续加油'
    if (hour < 23) return '晚上好，辛苦了'
    return '夜深了，早点休息'
  })
  const subscriptionLabel = computed(() =>
    subscriptionOfficialActivity.value ? '已订阅' : '未订阅',
  )

  // ---- 取数 ----
  async function loadProfile() {
    auth.hydrate()
    if (!auth.isAuthed) {
      return
    }

    try {
      const profile = await getProfile(auth.token)
      profileAvatarUrl.value = profile.avatar_url ?? ''
      profileEmail.value = profile.email ?? ''
      subscriptionOfficialActivity.value = Boolean(profile.subscribe_official_activity)
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '加载个人资料失败')
    }
  }

  async function loadCoupons() {
    auth.hydrate()
    if (!auth.isAuthed) {
      return
    }

    loading.value = true
    try {
      coupons.value = await listAvailableCoupons(auth.token)
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '加载券包失败')
    } finally {
      loading.value = false
    }
  }

  /** 读数条那颗刷新：券包、资料与两路需求侧数据并发，回来统一提示一次。 */
  async function refreshProfile() {
    await Promise.all([
      loadCoupons(),
      options.reloadRequirements(),
      options.reloadConversations(),
      loadProfile(),
    ])
    TMessage.success('资料已刷新')
  }

  // ---- 头像：选图入口 + 上传后回写 ----
  const avatarCrop = useAvatarCrop({ onUploaded: applyUploadedAvatar })
  const { uploading: profileAvatarUploading, open: openProfileAvatarCrop } = avatarCrop
  const { modalBindings: avatarCropModal } = useAvatarCropModalBindings(avatarCrop)

  /** 上传成功后回写头像：剔除失败集合里的旧地址，再换缓存键让页面顶部那颗头像重新拉图。 */
  function applyUploadedAvatar(avatarUrl: string) {
    if (avatarUrl) {
      const nextFailedUrls = new Set(failedProfileAvatarUrls.value)
      nextFailedUrls.delete(avatarUrl)
      failedProfileAvatarUrls.value = nextFailedUrls
    }
    profileAvatarUrl.value = avatarUrl
    profileAvatarCacheKey.value = Date.now()
  }

  function openProfileAvatarPicker() {
    if (profileAvatarUploading.value) {
      return
    }

    profileAvatarInput.value?.click()
  }

  function handleProfileAvatarChange(event: Event) {
    if (!auth.isAuthed) {
      TMessage.error('请先登录后上传头像')
      return
    }

    const input = event.target as HTMLInputElement | null
    const file = input?.files?.[0]
    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      TMessage.warning('头像仅支持图片格式')
      if (input) input.value = ''
      return
    }

    if (file.size > AVATAR_CROP_MAX_SOURCE_SIZE) {
      TMessage.warning('原图请控制在 8MB 以内')
      if (input) input.value = ''
      return
    }

    openProfileAvatarCrop(file)
    if (input) input.value = ''
  }

  function handleProfileAvatarError() {
    const avatarUrl = profileAvatarUrl.value.trim()
    if (!avatarUrl) return

    const next = new Set(failedProfileAvatarUrls.value)
    next.add(avatarUrl)
    failedProfileAvatarUrls.value = next
  }

  /** 离页换一次缓存键：下次进来重新拉图，不至于还挂着上一张（与拆分前同一口径）。 */
  onBeforeUnmount(() => {
    profileAvatarCacheKey.value = Date.now()
  })

  return {
    // 资料与券包的展示态
    loading,
    usableCouponCount,
    accountEmailLabel,
    profileAvatarSrc,
    profileInitial,
    timeGreeting,
    subscriptionLabel,
    // 头像挂点
    profileAvatarInput,
    profileAvatarUploading,
    avatarCropModal,
    openProfileAvatarPicker,
    handleProfileAvatarChange,
    handleProfileAvatarError,
    // 取数
    loadProfile,
    loadCoupons,
    refreshProfile,
  }
}
