<script setup lang="ts">
import { computed, ref, watch } from 'vue'


import { TButton, TDialog, TIcon, Plus, TMessage } from 'ui_73info'

/**
 * 资源图标选择器：正方形触发区 + 裁剪弹窗（拖动调整位置、滚轮缩放，应用后裁成 1200×742 的 PNG）。
 *
 * v-model       展示中的预览图，已保存封面 URL 或本地 data URL，空串表示没有图标
 * v-model:file  待上传的文件，未确认裁剪时是原图，确认后是裁剪结果
 */
const preview = defineModel<string>({ default: '' })
const file = defineModel<File | null>('file', { default: null })

const inputRef = ref<HTMLInputElement | null>(null)
const dialogVisible = ref(false)
const fileName = ref('')
const cropSource = ref('')
const cropScale = ref(1)
const cropX = ref(0)
const cropY = ref(0)
const cropMediaStyle = computed(() => ({
  transform: `translate(${cropX.value}%, ${cropY.value}%) scale(${cropScale.value})`,
}))
let cropDrag = {
  active: false,
  startX: 0,
  startY: 0,
  baseX: 0,
  baseY: 0,
  width: 1,
  height: 1,
}

// 外部改写预览（表单重置、保存成功后回填）时，丢弃裁剪中间状态；
// 组件自己写进去的值不算外部改写，保留现场以便继续微调
let lastEmittedPreview = ''
watch(preview, (value) => {
  if (value === lastEmittedPreview) {
    return
  }

  cropSource.value = ''
  fileName.value = ''
  resetCrop()
  file.value = null

  if (inputRef.value) {
    inputRef.value.value = ''
  }
})

function openDialog() {
  dialogVisible.value = true
}

function cropLimit(scale: number) {
  return ((scale - 1) / scale) * 50
}

function clampCrop(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function resetCrop() {
  cropScale.value = 1
  cropX.value = 0
  cropY.value = 0
}

function onCropPointerDown(event: PointerEvent) {
  const element = event.currentTarget as HTMLElement
  const rect = element.getBoundingClientRect()
  cropDrag = {
    active: true,
    startX: event.clientX,
    startY: event.clientY,
    baseX: cropX.value,
    baseY: cropY.value,
    width: rect.width || 1,
    height: rect.height || 1,
  }
  element.setPointerCapture(event.pointerId)
}

function onCropPointerMove(event: PointerEvent) {
  if (!cropDrag.active) return
  const limit = cropLimit(cropScale.value)
  cropX.value = clampCrop(
    cropDrag.baseX + ((event.clientX - cropDrag.startX) / cropDrag.width) * 100,
    -limit,
    limit,
  )
  cropY.value = clampCrop(
    cropDrag.baseY + ((event.clientY - cropDrag.startY) / cropDrag.height) * 100,
    -limit,
    limit,
  )
}

function onCropPointerUp() {
  cropDrag.active = false
}

function onCropWheel(event: WheelEvent) {
  const delta = event.deltaY < 0 ? 0.12 : -0.12
  cropScale.value = clampCrop(
    Math.round((cropScale.value + delta) * 100) / 100,
    1,
    4,
  )
  const limit = cropLimit(cropScale.value)
  cropX.value = clampCrop(cropX.value, -limit, limit)
  cropY.value = clampCrop(cropY.value, -limit, limit)
}

function triggerFileSelect() {
  inputRef.value?.click()
}

function removeIcon() {
  lastEmittedPreview = ''
  preview.value = ''
  file.value = null
  fileName.value = ''
  cropSource.value = ''
  resetCrop()

  if (inputRef.value) {
    inputRef.value.value = ''
  }
}

function readFileAsDataUrl(source: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('读取图标文件失败'))
    reader.readAsDataURL(source)
  })
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement | null
  const picked = input?.files?.[0]
  if (input) {
    input.value = ''
  }

  if (!picked) {
    return
  }

  if (!picked.type.startsWith('image/')) {
    TMessage.warning('图标文件仅支持图片格式')
    removeIcon()
    return
  }

  if (picked.size > 2 * 1024 * 1024) {
    TMessage.warning('图标文件请控制在 2MB 以内')
    removeIcon()
    return
  }

  try {
    const dataUrl = await readFileAsDataUrl(picked)
    fileName.value = picked.name
    file.value = picked
    cropSource.value = dataUrl
    resetCrop()
    lastEmittedPreview = dataUrl
    preview.value = dataUrl
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取图标文件失败'
    TMessage.error(message)
    removeIcon()
  }
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图标预览加载失败'))
    image.src = source
  })
}

async function confirmCrop() {
  if (!cropSource.value) return

  try {
    const image = await loadImage(cropSource.value)
    const canvas = document.createElement('canvas')
    const width = 1200
    const height = Math.round(width / 1.618)
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context || !image.naturalWidth || !image.naturalHeight) {
      throw new Error('未能生成裁剪结果')
    }

    const coverScale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
    const drawWidth = image.naturalWidth * coverScale * cropScale.value
    const drawHeight = image.naturalHeight * coverScale * cropScale.value
    const drawX = (width - drawWidth) / 2 + (cropX.value / 100) * width
    const drawY = (height - drawHeight) / 2 + (cropY.value / 100) * height
    context.drawImage(image, drawX, drawY, drawWidth, drawHeight)

    const dataUrl = canvas.toDataURL('image/png')
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png')
    })
    if (!blob) {
      throw new Error('未能生成裁剪文件')
    }

    const baseName = fileName.value.replace(/\.[^.]+$/, '') || 'icon'
    file.value = new File([blob], `${baseName}.png`, { type: 'image/png' })
    lastEmittedPreview = dataUrl
    preview.value = dataUrl
    dialogVisible.value = false
  } catch (error) {
    TMessage.warning(error instanceof Error ? error.message : '未能生成裁剪结果，请重试')
  }
}
</script>

<template>
  <div class="dev-icon-upload dev-icon-upload--square" @click="openDialog">
    <img v-if="preview" :src="preview" alt="图标预览" class="dev-icon-upload__square-image" />
    <TIcon v-else class="dev-icon-upload__square-plus"><Plus /></TIcon>
  </div>

  <TDialog v-model:open="dialogVisible" class="dev-icon-dialog-modal" title="上传图标" width="400px"
    :mask-closable="false">
    <div class="dev-icon-dialog">
      <input ref="inputRef" class="dev-icon-upload__native" type="file"
        accept="image/png,image/jpeg,image/webp,image/gif" @change="handleFileChange" />

      <template v-if="cropSource">
        <div class="dev-icon-editor">
          <div class="dev-icon-editor__crop" @wheel.prevent="onCropWheel" @dragstart.prevent
            @pointerdown="onCropPointerDown" @pointermove="onCropPointerMove" @pointerup="onCropPointerUp"
            @pointercancel="onCropPointerUp">
            <img :src="cropSource" alt="图标裁剪预览" class="dev-icon-editor__media" :style="cropMediaStyle"
              draggable="false" />
            <span class="dev-icon-editor__hint">拖动调整位置 · 滚轮缩放</span>
            <button type="button" class="dev-icon-editor__reselect" @pointerdown.stop
              @click="triggerFileSelect">重新选择</button>
          </div>
        </div>

        <div class="dev-icon-dialog__meta">
          <div class="dev-icon-dialog__name">{{ fileName || '未选择文件' }}</div>
        </div>

        <div class="dev-icon-dialog__actions">
          <TButton @click="resetCrop">重置位置</TButton>
          <div class="dev-icon-dialog__actions-main">
            <TButton variant="outline" tone="danger" @click="removeIcon">移除</TButton>
            <TButton variant="solid" tone="accent" @click="confirmCrop">应用</TButton>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="dev-icon-dialog__preview" @click="triggerFileSelect">
          <TIcon class="dev-icon-dialog__plus"><Plus /></TIcon>
          <span>点击选择图标</span>
        </div>

        <div class="dev-icon-dialog__meta">
          <div class="dev-icon-dialog__name">{{ fileName || '未选择文件' }}</div>
          <div class="dev-icon-dialog__hint">支持 PNG、JPG、WEBP、GIF，大小不超过 2MB</div>
        </div>

        <!-- 已有图标（编辑场景回填）时提供清除入口，不必先选一张新图 -->
        <div v-if="preview" class="dev-icon-dialog__actions">
          <div class="dev-icon-dialog__actions-main">
            <TButton variant="outline" tone="danger" @click="removeIcon">移除</TButton>
          </div>
        </div>
      </template>
    </div>
  </TDialog>
</template>
