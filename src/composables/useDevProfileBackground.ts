/**
 * 开发者公开主页的背景：头部渲染用的地址、设置弹窗的状态与上传 / 移除动作。
 *
 * 拆分前这些逻辑散在视图里（约 200 行），其中裁剪的拖拽 / 滚轮只影响弹窗自身，
 * 已随弹窗进 `DevProfileBackgroundDialog`；这里只留需要落库的部分：
 * 当前生效类型（静态 / 动态，localStorage 记住）、文件校验、上传与焦点提交。
 *
 * 生效类型由用户最后点的「设置静态 / 动态背景」决定；从没点过时按档案里有没有动态背景猜一次。
 */
import { computed, ref, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { TMessage } from 'ui_73info'

import { apiUrl } from '@/api/http'
import type { PublicUserProfile } from '@/api/publicProfile'
import {
  updateProfileBackgroundDynamic,
  updateProfileBackgroundStatic,
  uploadProfileBackground,
  uploadProfileBackgroundDynamic,
} from '@/api/settings'
import { focusToJson, isVideoUrl, parseFocus, type BgFocus } from '@/shared/devProfile'
import { useAuthStore } from '@/stores/auth'

/** 背景类型记忆键：静态 / 动态切换后刷新页面仍按上次的选择渲染。 */
const BACKGROUND_KIND_STORAGE_KEY = 'dev_profile_bg_kind'
const STATIC_MAX_SIZE = 5 * 1024 * 1024
const DYNAMIC_MAX_SIZE = 50 * 1024 * 1024
const DYNAMIC_ALLOWED_TYPES = ['video/mp4', 'video/webm', 'image/gif', 'image/webp']
const STATIC_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

export function useDevProfileBackground(options: {
  /** 公开档案（地址与焦点都从这里取） */
  profile: Ref<PublicUserProfile | null>
  canCustomizeStatic: Ref<boolean>
  canCustomizeDynamic: Ref<boolean>
  /** 上传 / 移除成功后的整页重载 */
  reload: () => Promise<void>
}) {
  const auth = useAuthStore()
  const router = useRouter()

  const activeBackgroundKind = ref<'static' | 'dynamic'>(
    (localStorage.getItem(BACKGROUND_KIND_STORAGE_KEY) as 'static' | 'dynamic') || 'static',
  )
  const dialogVisible = ref(false)
  const uploading = ref(false)
  const removing = ref(false)
  const mode = ref<'static' | 'dynamic'>('static')
  const file = ref<File | null>(null)
  const preview = ref('')
  /** 新选文件计数：弹窗据此把裁剪位置复位（打开弹窗时则按档案里的焦点还原）。 */
  const focusToken = ref(0)

  const staticBackgroundUrl = computed(() =>
    options.profile.value?.home_background_static
      ? apiUrl(options.profile.value.home_background_static)
      : '',
  )
  const dynamicBackgroundUrl = computed(() =>
    options.profile.value?.home_background_dynamic
      ? apiUrl(options.profile.value.home_background_dynamic)
      : '',
  )
  const showDynamicBackground = computed(() => activeBackgroundKind.value === 'dynamic')

  const videoBackgroundUrl = computed(() =>
    showDynamicBackground.value &&
    dynamicBackgroundUrl.value &&
    isVideoUrl(dynamicBackgroundUrl.value)
      ? dynamicBackgroundUrl.value
      : '',
  )
  /** 头部图片类背景：严格按当前生效类型返回，动态类型时给动图，静态类型时给静态图。 */
  const imageBackgroundUrl = computed(() => {
    if (showDynamicBackground.value) {
      return dynamicBackgroundUrl.value && !isVideoUrl(dynamicBackgroundUrl.value)
        ? dynamicBackgroundUrl.value
        : ''
    }
    return staticBackgroundUrl.value
  })
  const backgroundUrl = computed(() => videoBackgroundUrl.value || imageBackgroundUrl.value)

  const currentBackgroundFocus = computed<BgFocus>(() =>
    videoBackgroundUrl.value
      ? parseFocus(options.profile.value?.home_background_dynamic_focus)
      : parseFocus(options.profile.value?.home_background_static_focus),
  )
  const mediaStyle = computed((): Record<string, string> => {
    const focus = currentBackgroundFocus.value
    if (focus.scale === 1 && focus.x === 0 && focus.y === 0) {
      return {}
    }
    return { transform: `translate(${focus.x}%, ${focus.y}%) scale(${focus.scale})` }
  })

  const currentBackgroundUrl = computed(() =>
    mode.value === 'dynamic'
      ? (options.profile.value?.home_background_dynamic ?? '')
      : (options.profile.value?.home_background_static ?? ''),
  )
  const selectedBackgroundUrl = computed(() => {
    const url =
      mode.value === 'dynamic'
        ? options.profile.value?.home_background_dynamic
        : options.profile.value?.home_background_static
    return url ? apiUrl(url) : ''
  })

  /** 弹窗打开时裁剪位置的初值：按本次要设置的背景类型取档案里的焦点。 */
  const initialFocus = computed<BgFocus>(() =>
    mode.value === 'dynamic'
      ? parseFocus(options.profile.value?.home_background_dynamic_focus)
      : parseFocus(options.profile.value?.home_background_static_focus),
  )

  const isVideoPreview = computed(() => {
    if (file.value) {
      return file.value.type.startsWith('video/')
    }
    return isVideoUrl(preview.value)
  })

  const accept = computed(() =>
    mode.value === 'dynamic'
      ? 'video/mp4,video/webm,image/gif,image/webp'
      : 'image/png,image/jpeg,image/webp,image/gif',
  )

  function setActiveBackgroundKind(kind: 'static' | 'dynamic') {
    activeBackgroundKind.value = kind
    localStorage.setItem(BACKGROUND_KIND_STORAGE_KEY, kind)
  }

  /** 从没手动切过类型时，按档案里有没有动态背景决定首屏渲染哪一支。 */
  function syncBackgroundKind() {
    if (!localStorage.getItem(BACKGROUND_KIND_STORAGE_KEY)) {
      activeBackgroundKind.value = options.profile.value?.home_background_dynamic
        ? 'dynamic'
        : 'static'
    }
  }

  /** 本人点「设置静态 / 动态背景」：没兑换权益先去积分商城。 */
  function openBackground(nextMode: 'static' | 'dynamic') {
    if (!auth.token) {
      return
    }
    const canCustomize =
      nextMode === 'dynamic' ? options.canCustomizeDynamic.value : options.canCustomizeStatic.value
    if (!canCustomize) {
      TMessage.warning(
        `请先在积分商城兑换“主页${nextMode === 'dynamic' ? '动态' : '静态'}背景自定义”权益`,
      )
      void router.push({ name: 'points-mall' })
      return
    }
    mode.value = nextMode
    setActiveBackgroundKind(nextMode)
    file.value = null
    preview.value = selectedBackgroundUrl.value
    dialogVisible.value = true
  }

  function resetBackgroundDialog() {
    file.value = null
    if (preview.value.startsWith('blob:')) {
      URL.revokeObjectURL(preview.value)
    }
    preview.value = ''
  }

  /** 选文件后的校验：类型与大小都按当前静态 / 动态档位走。 */
  function pickBackgroundFile(nextFile: File) {
    const isDynamic = mode.value === 'dynamic'
    const allowedTypes = isDynamic ? DYNAMIC_ALLOWED_TYPES : STATIC_ALLOWED_TYPES
    if (!allowedTypes.includes(nextFile.type)) {
      TMessage.warning(
        isDynamic
          ? '动态背景仅支持 MP4、WebM 视频，或 GIF、WEBP 动图'
          : '背景图仅支持 PNG、JPG、WEBP 或 GIF 图片',
      )
      return
    }
    const maxSize = isDynamic ? DYNAMIC_MAX_SIZE : STATIC_MAX_SIZE
    if (nextFile.size > maxSize) {
      TMessage.warning(isDynamic ? '动态背景视频不能超过 50MB' : '背景图片不能超过 5MB')
      return
    }

    if (preview.value) {
      URL.revokeObjectURL(preview.value)
    }
    file.value = nextFile
    preview.value = URL.createObjectURL(nextFile)
    focusToken.value += 1
  }

  /** 保存：有新文件先上传拿地址，再带上裁剪焦点落库；没有新文件时只提交焦点。 */
  async function submitBackground(focus: BgFocus) {
    if (!auth.token || uploading.value) {
      return
    }
    uploading.value = true
    try {
      const focusJson = focusToJson(focus)
      if (mode.value === 'dynamic') {
        if (file.value) {
          const profile = await uploadProfileBackgroundDynamic(auth.token, file.value)
          await updateProfileBackgroundDynamic(
            auth.token,
            profile.home_background_dynamic ?? '',
            focusJson,
          )
        } else {
          await updateProfileBackgroundDynamic(auth.token, currentBackgroundUrl.value, focusJson)
        }
      } else if (file.value) {
        const profile = await uploadProfileBackground(auth.token, file.value)
        await updateProfileBackgroundStatic(
          auth.token,
          profile.home_background_static ?? '',
          focusJson,
        )
      } else {
        await updateProfileBackgroundStatic(auth.token, currentBackgroundUrl.value, focusJson)
      }
      TMessage.success('主页背景已更新')
      dialogVisible.value = false
      await options.reload()
    } catch (err) {
      TMessage.error(
        err instanceof Error
          ? err.message
          : `设置${mode.value === 'dynamic' ? '动态' : '静态'}背景失败`,
      )
    } finally {
      uploading.value = false
    }
  }

  async function removeBackground() {
    if (!auth.token || removing.value) {
      return
    }
    removing.value = true
    try {
      const update =
        mode.value === 'dynamic' ? updateProfileBackgroundDynamic : updateProfileBackgroundStatic
      await update(auth.token, '')
      dialogVisible.value = false
      resetBackgroundDialog()
      await options.reload()
      TMessage.success('主页背景已移除')
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '移除主页背景失败')
    } finally {
      removing.value = false
    }
  }

  return {
    dialogVisible,
    uploading,
    removing,
    mode,
    file,
    preview,
    focusToken,
    accept,
    isVideoPreview,
    initialFocus,
    backgroundUrl,
    videoBackgroundUrl,
    imageBackgroundUrl,
    mediaStyle,
    openBackground,
    resetBackgroundDialog,
    pickBackgroundFile,
    submitBackground,
    removeBackground,
    syncBackgroundKind,
  }
}
