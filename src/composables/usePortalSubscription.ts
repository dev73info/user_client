import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { TMessage } from 'ui_73info'

import { apiUrl } from '@/api/http'
import { getProfile, updateProfileSubscriptions } from '@/api/settings'
import { PROFILE_AVATAR_UPDATED_EVENT } from '@/shared/profileEvents'
import { useAuthStore } from '@/stores/auth'

import type { AuthMode } from './usePortalTopNavNav'

/**
 * 三个下拉（搜索范围 / 订阅菜单 / 用户胶囊菜单）共用的「点外部关闭」：点在自己这块区域
 * （`rootSelector`）外或按 `Escape` 就收起；用户胶囊菜单原本没监听 Esc，传
 * `closeOnEscape: false` 保持原样。模板里各自的包裹层必须继续带 `@click.stop` —— 那是
 * 「点自己」不冒到 `document` 的第一道保险，少一道三个下拉就会互相误关。
 */
export function usePortalMenuDismiss(options: {
  rootSelector: string
  close: () => void
  closeOnEscape?: boolean
}) {
  function handleDocumentClick(event: MouseEvent) {
    const insideRoot =
      event.target instanceof Element && Boolean(event.target.closest(options.rootSelector))
    if (!insideRoot) {
      options.close()
    }
  }

  function handleDocumentKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      options.close()
    }
  }

  onMounted(() => {
    document.addEventListener('click', handleDocumentClick)
    if (options.closeOnEscape !== false) {
      document.addEventListener('keydown', handleDocumentKeydown)
    }
  })

  onBeforeUnmount(() => {
    document.removeEventListener('click', handleDocumentClick)
    document.removeEventListener('keydown', handleDocumentKeydown)
  })
}

/**
 * 顶栏账号侧的远端状态：头像 + 两个消息订阅开关。三者来自同一个 `GET /settings/profile`，
 * 所以同进同出：订阅是乐观更新 + 失败回滚（`lastSyncedSubscriptions` 兜最近一次服务端确认
 * 值），头像加载失败退回人物剪影、别处换过头像（`PROFILE_AVATAR_UPDATED_EVENT`）就重拉。
 * `openAuth` 由调用方注入——这里不碰 router，未登录时只把用户送去登录弹窗。
 */
export function usePortalSubscription(options: { openAuth: (mode: AuthMode) => void }) {
  const auth = useAuthStore()
  const officialActivitySubscriptionEnabled = ref(false)
  const devHallSubscriptionEnabled = ref(false)
  const subscriptionMenuOpen = ref(false)
  const subscriptionLoading = ref(false)
  const subscriptionSaving = ref(false)
  const lastSyncedSubscriptions = ref({
    subscribe_official_activity: false,
    subscribe_dev_hall_deposit_paid: false,
  })
  // 顶栏用户胶囊里的头像：后端 `GET /settings/profile` 的 `avatar_url`
  const userAvatarUrl = ref('')
  const userAvatarFailed = ref(false)

  const subscriptionBusy = computed(() => subscriptionLoading.value || subscriptionSaving.value)
  const hasActiveSubscription = computed(
    () => officialActivitySubscriptionEnabled.value || devHallSubscriptionEnabled.value,
  )
  const allSubscriptionsEnabled = computed(
    () => officialActivitySubscriptionEnabled.value && devHallSubscriptionEnabled.value,
  )
  const bellTitle = computed(() => {
    if (subscriptionBusy.value) {
      return '消息订阅同步中'
    }

    return allSubscriptionsEnabled.value ? '关闭全部消息订阅' : '开启全部消息订阅'
  })
  const userAvatarSrc = computed(() => {
    const url = userAvatarUrl.value.trim()
    if (!url || userAvatarFailed.value) {
      return ''
    }

    return apiUrl(url)
  })

  usePortalMenuDismiss({ rootSelector: '.portal-subscription', close: closeMenu })

  watch(
    () => [auth.isAuthed, auth.token] as const,
    ([isAuthed, token]) => {
      if (!isAuthed || !token.trim()) {
        resetSubscriptionState()
        userAvatarUrl.value = ''
        userAvatarFailed.value = false
        return
      }

      void loadProfileState()
    },
    { immediate: true },
  )

  onMounted(() => {
    window.addEventListener(PROFILE_AVATAR_UPDATED_EVENT, handleProfileAvatarUpdated)
  })

  onBeforeUnmount(() => {
    window.removeEventListener(PROFILE_AVATAR_UPDATED_EVENT, handleProfileAvatarUpdated)
  })

  function closeMenu() {
    subscriptionMenuOpen.value = false
  }

  function resetSubscriptionState() {
    subscriptionMenuOpen.value = false
    syncSubscriptionState({
      subscribe_official_activity: false,
      subscribe_dev_hall_deposit_paid: false,
    })
  }

  function syncSubscriptionState(subscriptions: {
    subscribe_official_activity: boolean
    subscribe_dev_hall_deposit_paid: boolean
  }) {
    const officialEnabled = Boolean(subscriptions.subscribe_official_activity)
    const devHallEnabled = Boolean(subscriptions.subscribe_dev_hall_deposit_paid)

    officialActivitySubscriptionEnabled.value = officialEnabled
    devHallSubscriptionEnabled.value = devHallEnabled
    lastSyncedSubscriptions.value = {
      subscribe_official_activity: officialEnabled,
      subscribe_dev_hall_deposit_paid: devHallEnabled,
    }
  }

  function applyUserAvatar(nextAvatarUrl: string | null | undefined) {
    userAvatarUrl.value = (nextAvatarUrl ?? '').trim()
    userAvatarFailed.value = false
  }

  // 头像图片加载失败（例如服务端文件被清理）时退回默认人物剪影，避免顶栏出现裂图
  function handleUserAvatarError() {
    userAvatarFailed.value = true
  }

  // 别处（个人主页 / 账号页）换过头像就重新拉一次，让顶栏跟着更新
  function handleProfileAvatarUpdated() {
    if (!auth.isAuthed || !auth.token.trim()) {
      return
    }

    void loadProfileState()
  }

  async function loadProfileState() {
    if (!auth.isAuthed || !auth.token.trim()) {
      return
    }

    subscriptionLoading.value = true
    try {
      // `GET /settings/profile` 一次带回头像与两个订阅开关，不再单开订阅查询接口
      const profile = await getProfile(auth.token)
      syncSubscriptionState({
        subscribe_official_activity: Boolean(profile.subscribe_official_activity),
        subscribe_dev_hall_deposit_paid: Boolean(profile.subscribe_dev_hall_deposit_paid),
      })
      applyUserAvatar(profile.avatar_url)
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '加载个人资料失败')
    } finally {
      subscriptionLoading.value = false
    }
  }

  function openSubscriptionMenu() {
    if (!auth.isAuthed || !auth.token.trim()) {
      options.openAuth('login')
      return
    }

    subscriptionMenuOpen.value = true

    if (!subscriptionLoading.value) {
      void loadProfileState()
    }
  }

  function handleBellClick() {
    void toggleAllSubscriptions()
  }

  async function toggleAllSubscriptions() {
    if (!auth.isAuthed || !auth.token.trim()) {
      options.openAuth('login')
      return
    }

    if (subscriptionBusy.value) {
      return
    }

    const nextEnabled = !allSubscriptionsEnabled.value
    const nextState = {
      subscribe_official_activity: nextEnabled,
      subscribe_dev_hall_deposit_paid: nextEnabled,
    }

    officialActivitySubscriptionEnabled.value = nextEnabled
    devHallSubscriptionEnabled.value = nextEnabled
    subscriptionSaving.value = true
    try {
      const updated = await updateProfileSubscriptions(auth.token, nextState)
      syncSubscriptionState(updated)
      TMessage.success(nextEnabled ? '已开启全部消息订阅' : '已关闭全部消息订阅')
    } catch (err) {
      officialActivitySubscriptionEnabled.value =
        lastSyncedSubscriptions.value.subscribe_official_activity
      devHallSubscriptionEnabled.value =
        lastSyncedSubscriptions.value.subscribe_dev_hall_deposit_paid
      TMessage.error(err instanceof Error ? err.message : '保存消息订阅失败')
    } finally {
      subscriptionSaving.value = false
    }
  }

  async function toggleSubscription(type: 'official_activity' | 'dev_hall_deposit_paid') {
    const isOfficialActivity = type === 'official_activity'

    if (!auth.isAuthed || !auth.token.trim()) {
      options.openAuth('login')
      return
    }

    if (subscriptionBusy.value) {
      return
    }

    const nextEnabled = isOfficialActivity
      ? !officialActivitySubscriptionEnabled.value
      : !devHallSubscriptionEnabled.value

    if (isOfficialActivity) {
      officialActivitySubscriptionEnabled.value = nextEnabled
    } else {
      devHallSubscriptionEnabled.value = nextEnabled
    }

    subscriptionSaving.value = true
    try {
      const updated = await updateProfileSubscriptions(
        auth.token,
        isOfficialActivity
          ? { subscribe_official_activity: nextEnabled }
          : { subscribe_dev_hall_deposit_paid: nextEnabled },
      )
      syncSubscriptionState(updated)
      TMessage.success(
        nextEnabled
          ? `已开启${isOfficialActivity ? '官方活动通知' : '开发者接单提醒'}`
          : `已关闭${isOfficialActivity ? '官方活动通知' : '开发者接单提醒'}`,
      )
    } catch (err) {
      officialActivitySubscriptionEnabled.value =
        lastSyncedSubscriptions.value.subscribe_official_activity
      devHallSubscriptionEnabled.value =
        lastSyncedSubscriptions.value.subscribe_dev_hall_deposit_paid
      TMessage.error(err instanceof Error ? err.message : '保存消息订阅失败')
    } finally {
      subscriptionSaving.value = false
    }
  }

  return {
    officialActivitySubscriptionEnabled,
    devHallSubscriptionEnabled,
    subscriptionMenuOpen,
    subscriptionBusy,
    hasActiveSubscription,
    bellTitle,
    userAvatarSrc,
    closeMenu,
    openSubscriptionMenu,
    handleBellClick,
    toggleSubscription,
    handleUserAvatarError,
  }
}
