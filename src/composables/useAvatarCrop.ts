import {
  computed,
  nextTick,
  onMounted,
  onScopeDispose,
  reactive,
  ref,
  type ComponentPublicInstance,
} from 'vue'
import { TMessage } from 'ui_73info'

import { uploadProfileAvatar } from '@/api/settings'
import {
  avatarCropImageStyle,
  avatarCropMinScale,
  avatarCropOutputName,
  avatarCropSourceRect,
  avatarCropZoomPercent,
  clampAvatarCropOffset,
  clampNumber,
  createAvatarCropGeometry,
  drawAvatarCropCanvas,
  rescaleAvatarCrop,
  type AvatarCropGeometry,
  type AvatarCropOffset,
} from '@/shared/avatarCrop'
import { dispatchProfileAvatarUpdated } from '@/shared/profileEvents'
import { useAuthStore } from '@/stores/auth'

/** 裁剪结果上限：头像接口只收 2MB。 */
const MAX_UPLOAD_SIZE = 2 * 1024 * 1024
/** 输出边长：512 够两倍图，再大只白占带宽。 */
const OUTPUT_SIZE = 512
/** 量不到舞台宽度（弹窗还没布局）时的兜底，与 `.profile-avatar-crop-stage` 的 `min(320px, 100%)` 对齐。 */
const DEFAULT_FRAME_SIZE = 320
/** 缩放上限 = 最小倍数 × 3：留三档余量，再多只是糊。 */
const MAX_SCALE_RATIO = 3

/** 一次拖拽的起点：指针 id 用来丢掉别的指头 / 别的元素冒上来的事件。 */
type AvatarCropDragStart = {
  pointerId: number
  clientLeft: number
  clientTop: number
  offsetLeft: number
  offsetTop: number
}

/** 边界钳制的正本在 `@/shared/avatarCrop`，这里转出来给同域调用方一处入口。 */
export { clampNumber }

/**
 * 头像裁剪域：缩放 / 拖拽 / 边界钳制 / Canvas 出图 / 上传状态，外加预览 blob 的生命周期。
 *
 * 分工：几何与出图在 `@/shared/avatarCrop`（纯函数），弹窗在 `ProfileAvatarCropModal.vue`
 * （只渲染、只 emit，挂点见 `useAvatarCropModalBindings`），**判定、请求与 toast 全在这一层**；
 * 视图只剩「选图入口」与「上传后回写头像」（`options.onUploaded`：地址、缓存键、失败集合由视图持有）。
 *
 * blob 归这里（`onScopeDispose` 里 revoke），不归视图也不归组件：地址的生命周期得跟着
 * **创建它的作用域**走。早先 revoke 挂在视图的 `onBeforeUnmount` 上，拆走一层就漏一处
 * ——预览图不释放，而且看不出症状。
 */
export function useAvatarCrop(options: { onUploaded: (avatarUrl: string) => void }) {
  const auth = useAuthStore()

  /** 舞台与图片的几何：量框、缩放、位移改的都是它，`@/shared/avatarCrop` 的函数直接吃这一份。 */
  const crop = reactive<AvatarCropGeometry>(createAvatarCropGeometry(DEFAULT_FRAME_SIZE))
  const minScale = ref(1)
  const imageEl = ref<HTMLImageElement | null>(null)
  const visible = ref(false)
  const uploading = ref(false)
  const previewUrl = ref('')
  const dragging = ref(false)
  const sourceFile = ref<File | null>(null)
  /** 拖拽起点与舞台元素只活在事件之间，不进模板，所以不做成 ref。 */
  let dragStart: AvatarCropDragStart | null = null
  let frameEl: Element | null = null

  const hasImage = computed(() => imageEl.value !== null)
  const zoomPercent = computed(() => avatarCropZoomPercent(minScale.value, crop.scale))
  const imageStyle = computed(() => avatarCropImageStyle(crop))

  /** 组件里 `<div :ref="registerFrame">`：元素挂上 / 卸下都会回调，`instanceof` 挡掉组件实例。 */
  function registerFrame(el: Element | ComponentPublicInstance | null) {
    frameEl = el instanceof HTMLElement ? el : null
  }

  function measureFrame() {
    crop.frameSize = frameEl?.clientWidth || DEFAULT_FRAME_SIZE
  }

  /** 居中复位：量框 → 最小倍数重算（换图、变窗宽都要）→ 位移归零。 */
  function resetFrame() {
    measureFrame()
    minScale.value = avatarCropMinScale(crop.frameSize, crop.imageWidth, crop.imageHeight)
    crop.scale = minScale.value
    crop.offset = { left: 0, top: 0 }
  }

  /** 滚轮缩放：以鼠标点为锚点，锚点下的像素不动；`deltaMode` 1/2 是「行/页」，先折算成像素。 */
  function handleWheel(event: WheelEvent) {
    const stage = event.currentTarget
    if (!imageEl.value || uploading.value || !(stage instanceof HTMLElement)) {
      return
    }
    const wheelDelta =
      event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? crop.frameSize : 1)
    const rect = stage.getBoundingClientRect()
    const next = rescaleAvatarCrop({
      ...crop,
      nextScale: crop.scale * Math.exp(-wheelDelta * 0.0015),
      minScale: minScale.value,
      maxScale: minScale.value * MAX_SCALE_RATIO,
      focus: { left: event.clientX - rect.left, top: event.clientY - rect.top },
    })

    if (next.changed) {
      crop.scale = next.scale
      crop.offset = next.offset
    }
  }

  function handlePointerDown(event: PointerEvent) {
    const stage = event.currentTarget
    if (!imageEl.value || !(stage instanceof HTMLElement)) {
      return
    }
    event.preventDefault()
    dragging.value = true
    dragStart = {
      pointerId: event.pointerId,
      clientLeft: event.clientX,
      clientTop: event.clientY,
      offsetLeft: crop.offset.left,
      offsetTop: crop.offset.top,
    }
    stage.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: PointerEvent) {
    if (!dragStart || dragStart.pointerId !== event.pointerId) {
      return
    }
    // 位移只认「按下时的位移 + 本次指针增量」，再统一过一遍钳制，拖出界会自己贴边。
    crop.offset = clampAvatarCropOffset({
      ...crop,
      offset: {
        left: dragStart.offsetLeft + event.clientX - dragStart.clientLeft,
        top: dragStart.offsetTop + event.clientY - dragStart.clientTop,
      },
    })
  }

  function stopDrag(event: PointerEvent) {
    if (!dragStart || dragStart.pointerId !== event.pointerId) {
      return
    }

    const stage = event.currentTarget
    if (stage instanceof HTMLElement && stage.hasPointerCapture(event.pointerId)) {
      stage.releasePointerCapture(event.pointerId)
    }

    dragStart = null
    dragging.value = false
  }

  function handleImageLoad(event: Event) {
    const image = event.target
    if (!(image instanceof HTMLImageElement) || !image.naturalWidth || !image.naturalHeight) {
      TMessage.error('无法读取头像图片')
      reset()
      return
    }
    imageEl.value = image
    crop.imageWidth = image.naturalWidth
    crop.imageHeight = image.naturalHeight
    resetFrame()
  }

  /** 窗宽变了：舞台宽度跟着变，最小倍数要重算，但用户当前的缩放比例得保住。 */
  function handleResize() {
    if (!visible.value || !imageEl.value) {
      return
    }
    const zoomRatio = crop.scale / Math.max(minScale.value, 0.001)
    measureFrame()
    minScale.value = avatarCropMinScale(crop.frameSize, crop.imageWidth, crop.imageHeight)
    crop.scale = clampNumber(
      minScale.value * zoomRatio,
      minScale.value,
      minScale.value * MAX_SCALE_RATIO,
    )
    crop.offset = clampAvatarCropOffset(crop)
  }

  /** 关窗与卸载共用：先释放预览 blob，再清几何状态。 */
  function reset() {
    if (previewUrl.value) {
      URL.revokeObjectURL(previewUrl.value)
    }

    Object.assign(crop, createAvatarCropGeometry(DEFAULT_FRAME_SIZE))
    minScale.value = 1
    imageEl.value = null
    visible.value = false
    previewUrl.value = ''
    sourceFile.value = null
    dragStart = null
    dragging.value = false
  }

  function close() {
    if (!uploading.value) {
      reset()
    }
  }

  /** 打开裁剪：先释放上一张的预览地址，再挂新 blob；弹窗这时才渲染，所以等 DOM 落地再量框宽。 */
  function open(file: File) {
    reset()
    sourceFile.value = file
    previewUrl.value = URL.createObjectURL(file)
    visible.value = true
    void nextTick(measureFrame)
  }

  async function createCroppedProfileAvatarFile() {
    const file = sourceFile.value
    const image = imageEl.value
    if (!file || !image) {
      throw new Error('请先选择头像图片')
    }

    const blob = await drawAvatarCropCanvas(image, avatarCropSourceRect(crop), OUTPUT_SIZE)

    return new File([blob], avatarCropOutputName(file), {
      type: blob.type || 'image/jpeg',
      lastModified: Date.now(),
    })
  }

  async function submit() {
    if (!auth.isAuthed) {
      TMessage.error('请先登录后上传头像')
      return
    }

    if (uploading.value) {
      return
    }

    uploading.value = true
    try {
      const file = await createCroppedProfileAvatarFile()
      if (file.size > MAX_UPLOAD_SIZE) {
        TMessage.warning('裁剪后图片仍超过 2MB，请缩小图片后重试')
        return
      }

      const profile = await uploadProfileAvatar(auth.token, file)
      options.onUploaded(profile.avatar_url ?? '')
      dispatchProfileAvatarUpdated()
      TMessage.success('头像已更新')
      reset()
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '上传头像失败')
    } finally {
      uploading.value = false
    }
  }

  onMounted(() => window.addEventListener('resize', handleResize))
  onScopeDispose(() => {
    window.removeEventListener('resize', handleResize)
    reset()
  })

  // 弹窗挂点在 `useAvatarCropModalBindings`（那边只做形状转换，这里已经贴着 300 行上限）。
  return {
    uploading,
    visible,
    previewUrl,
    imageStyle,
    dragging,
    zoomPercent,
    hasImage,
    registerFrame,
    handleImageLoad,
    handleWheel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp: stopDrag,
    resetFrame,
    open,
    close,
    submit,
    createCroppedProfileAvatarFile,
  }
}
