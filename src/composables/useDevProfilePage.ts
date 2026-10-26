/**
 * 开发者公开主页（`/user/:username/profile`）的装配层。
 *
 * 视图只剩结构：头部 / 读数 / 收到打赏 / 公开资源 / 三个弹窗。
 * 取数、背景、简介编辑、打赏入口各自在下面的 composable 里；
 * 这里负责把它们串成一条加载链（公开档案 + 资源 → 背景类型），
 * 以及三处共用的整页重载（简介保存、背景上传 / 移除、打赏成功）。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { TMessage } from 'ui_73info'

import { apiUrl } from '@/api/http'
import type { PublicMcResourceItem } from '@/api/resources'
import { resolveResourceTarget } from '@/shared/devProfile'
import { useAuthStore } from '@/stores/auth'

import { useDevProfileBackground } from './useDevProfileBackground'
import { useDevProfileData } from './useDevProfileData'
import { useDevProfileEdit } from './useDevProfileEdit'
import { useDevProfilePerks } from './useDevProfilePerks'
import { useDevProfileTips } from './useDevProfileTips'

/** 公开资源卡的展示口径：组件只吃这几个字段，不碰 api 与路由。 */
export type DevProfileResourceCard = {
  id: number
  title: string
  description: string
  platform: string
  likeCount: number
  coverUrl: string
}

export function useDevProfilePage() {
  const auth = useAuthStore()
  const router = useRouter()

  const data = useDevProfileData()
  const loading = ref(false)
  const perks = useDevProfilePerks()

  async function reload() {
    if (!data.username.value) {
      return
    }
    loading.value = true
    try {
      await data.load()
      background.syncBackgroundKind()
      await perks.load(data.isSelf.value)
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '加载开发者信息失败')
    } finally {
      loading.value = false
    }
  }

  const background = useDevProfileBackground({ profile: data.publicProfile, reload })
  const edit = useDevProfileEdit({ reload })
  const tips = useDevProfileTips({ canTip: data.canTip, reload })

  // ---------------------------------------------------------------------------
  // 头像 / 封面加载失败：记下失败的完整地址，之后不再渲染这张图（回退到文字占位）
  // ---------------------------------------------------------------------------
  const failedAvatarUrls = ref<Set<string>>(new Set())
  const failedCoverUrls = ref<Set<string>>(new Set())

  const avatarUrl = computed(() => {
    const url = data.publicProfile.value?.avatar_url
    if (!url) {
      return ''
    }
    const full = apiUrl(url)
    return failedAvatarUrls.value.has(full) ? '' : full
  })

  function coverUrlOf(resource: PublicMcResourceItem): string {
    if (!resource.cover_url) {
      return ''
    }
    const full = apiUrl(resource.cover_url)
    return failedCoverUrls.value.has(full) ? '' : full
  }

  function onAvatarError() {
    const url = data.publicProfile.value?.avatar_url
    if (url) {
      failedAvatarUrls.value.add(apiUrl(url))
    }
  }

  const resourceCards = computed<DevProfileResourceCard[]>(() =>
    data.userResources.value.map((resource) => ({
      id: resource.id,
      title: resource.title,
      description: resource.description,
      platform: resource.platform,
      likeCount: resource.like_count,
      coverUrl: coverUrlOf(resource),
    })),
  )

  function onCoverError(resourceId: number) {
    const resource = data.userResources.value.find((item) => item.id === resourceId)
    if (resource?.cover_url) {
      failedCoverUrls.value.add(apiUrl(resource.cover_url))
    }
  }

  function openResource(resourceId: number) {
    const resource = data.userResources.value.find((item) => item.id === resourceId)
    if (!resource) {
      return
    }
    void router.push(resolveResourceTarget(resource))
  }

  onMounted(() => {
    void reload()
  })

  return {
    // 页面骨架
    loading,
    // 头部
    username: data.username,
    avatarUrl,
    onAvatarError,
    profileDescription: data.profileDescription,
    profileGradient: data.profileGradient,
    profileColor: data.profileColor,
    isSelf: data.isSelf,
    canTip: data.canTip,
    videoBackgroundUrl: background.videoBackgroundUrl,
    imageBackgroundUrl: background.imageBackgroundUrl,
    mediaStyle: background.mediaStyle,
    /** 头部点「编辑简介」：把当前简介带进弹窗草稿 */
    editProfile: () => edit.editProfile(data.profileDescription.value),
    setBackground: (nextMode: 'static' | 'dynamic') => {
      if (perks.error.value) {
        TMessage.error(perks.error.value)
        return
      }
      const allowStatic = perks.canCustomizeBackground.value
      const allowDynamic = perks.canCustomizeDynamicBackground.value
      if (!allowStatic && !allowDynamic) {
        TMessage.warning('请先兑换主页背景权益')
        return
      }
      const mode =
        nextMode === 'dynamic' && allowDynamic
          ? 'dynamic'
          : nextMode === 'static' && allowStatic
            ? 'static'
            : allowStatic
              ? 'static'
              : 'dynamic'
      background.openBackground(mode)
    },
    openTipDialog: tips.openTipDialog,
    openTipSettings: tips.openTipSettings,
    // 读数
    stats: data.stats,
    // 收到打赏
    showReceivedTips: data.showReceivedTips,
    receivedCashText: data.receivedCashText,
    recentTipMessages: data.recentTipMessages,
    // 公开资源
    resourceCards,
    resourceCount: computed(() => data.userResources.value.length),
    openResource,
    onCoverError,
    // 背景弹窗
    backgroundDialogVisible: background.dialogVisible,
    backgroundMode: background.mode,
    backgroundPreview: background.preview,
    backgroundVideoPreview: background.isVideoPreview,
    backgroundAccept: background.accept,
    backgroundUploading: background.uploading,
    backgroundRemoving: background.removing,
    backgroundUrl: background.backgroundUrl,
    backgroundInitialFocus: background.initialFocus,
    backgroundFocusToken: background.focusToken,
    canSaveBackground: computed(() => background.file.value !== null),
    pickBackgroundFile: background.pickBackgroundFile,
    submitBackground: background.submitBackground,
    removeBackground: background.removeBackground,
    resetBackgroundDialog: background.resetBackgroundDialog,
    // 简介弹窗
    profileDialogVisible: edit.dialogVisible,
    profileDescriptionDraft: edit.descriptionDraft,
    profileSaving: edit.saving,
    saveProfile: edit.saveProfile,
    // 打赏弹窗
    tipDialogOpen: tips.dialogOpen,
    tipBlock: data.tipBlock,
    authToken: computed(() => auth.token),
    onTipSuccess: tips.onTipSuccess,
  }
}
