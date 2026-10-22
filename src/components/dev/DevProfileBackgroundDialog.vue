<script setup lang="ts">
/**
 * 「设置主页静态 / 动态背景」弹窗：选文件、16:6 裁剪预览（拖动平移、滚轮缩放）与保存 / 移除。
 *
 * 从 `DevProfileView` 抽出来。落库在 `useDevProfileBackground`：这里只维护裁剪状态，
 * 保存时把焦点 (scale / x / y) 交给父级去拼 `focus` JSON 并提交。
 * 每次打开按档案里的焦点还原；选了新文件则复位到 1 / 0 / 0（`focusToken` 递增）。
 */
import { computed, ref, watch } from 'vue'
import { TButton, TDialog } from 'ui_73info'

import { DEFAULT_BG_FOCUS, clampValue, cropLimit, type BgFocus } from '@/shared/devProfile'

const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  mode: 'static' | 'dynamic'
  preview: string
  videoPreview: boolean
  accept: string
  hasBackground: boolean
  initialFocus: BgFocus
  focusToken: number
  uploading: boolean
  removing: boolean
  canSave: boolean
}>()

const emit = defineEmits<{
  save: [focus: BgFocus]
  remove: []
  pick: [file: File]
  closed: []
}>()

const inputRef = ref<HTMLInputElement | null>(null)

// 裁剪预览状态：scale 缩放，x / y 为 translate 百分比，16:6 固定比例
const cropScale = ref(1)
const cropX = ref(0)
const cropY = ref(0)
const cropMediaStyle = computed(() => ({
  transform: `translate(${cropX.value}%, ${cropY.value}%) scale(${cropScale.value})`,
}))
let cropDrag = { active: false, startX: 0, startY: 0, baseX: 0, baseY: 0, width: 1, height: 1 }

function applyFocus(focus: BgFocus) {
  cropScale.value = focus.scale
  cropX.value = focus.x
  cropY.value = focus.y
}

// 打开时按档案里的焦点还原；换了新文件（focusToken 递增）则回到默认焦点
watch(
  () => open.value,
  (visible) => {
    if (visible) {
      applyFocus(props.initialFocus)
    }
  },
  { immediate: true },
)
watch(
  () => props.focusToken,
  () => applyFocus(DEFAULT_BG_FOCUS),
)

function onCropPointerDown(e: PointerEvent) {
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  cropDrag = {
    active: true,
    startX: e.clientX,
    startY: e.clientY,
    baseX: cropX.value,
    baseY: cropY.value,
    width: rect.width || 1,
    height: rect.height || 1,
  }
  el.setPointerCapture(e.pointerId)
}
function onCropPointerMove(e: PointerEvent) {
  if (!cropDrag.active) return
  cropX.value = clampValue(
    cropDrag.baseX + ((e.clientX - cropDrag.startX) / cropDrag.width) * 100,
    -cropLimit(cropScale.value),
    cropLimit(cropScale.value),
  )
  cropY.value = clampValue(
    cropDrag.baseY + ((e.clientY - cropDrag.startY) / cropDrag.height) * 100,
    -cropLimit(cropScale.value),
    cropLimit(cropScale.value),
  )
}
function onCropPointerUp() {
  cropDrag.active = false
}
function onCropWheel(e: WheelEvent) {
  const delta = e.deltaY < 0 ? 0.12 : -0.12
  cropScale.value = clampValue(Math.round((cropScale.value + delta) * 100) / 100, 1, 4)
  cropX.value = clampValue(cropX.value, -cropLimit(cropScale.value), cropLimit(cropScale.value))
  cropY.value = clampValue(cropY.value, -cropLimit(cropScale.value), cropLimit(cropScale.value))
}

/** 选文件：清空 input 以便同一个文件能再选一次；校验（类型 / 大小）在父级的 pick 里。 */
function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) {
    emit('pick', file)
  }
}

function save() {
  emit('save', { scale: cropScale.value, x: cropX.value, y: cropY.value })
}
</script>

<template>
  <TDialog
    v-model:open="open"
    class="dev-profile__background-dialog"
    :title="mode === 'dynamic' ? '设置动态背景' : '设置静态背景'"
    width="480px"
    :mask-closable="false"
    @closed="emit('closed')"
  >
    <div class="dev-profile__bg-upload">
      <input
        ref="inputRef"
        class="dev-profile__bg-input"
        type="file"
        :accept="accept"
        @change="onFileChange"
      />
      <div
        v-if="preview"
        class="dev-profile__crop"
        @wheel.prevent="onCropWheel"
        @dragstart.prevent
        @pointerdown="onCropPointerDown"
        @pointermove="onCropPointerMove"
        @pointerup="onCropPointerUp"
        @pointercancel="onCropPointerUp"
      >
        <video
          v-if="videoPreview"
          :src="preview"
          class="dev-profile__crop-media dev-profile__bg-video"
          :style="cropMediaStyle"
          autoplay
          loop
          muted
          playsinline
        ></video>
        <img
          v-else
          :src="preview"
          alt="背景预览"
          class="dev-profile__crop-media"
          :style="cropMediaStyle"
          draggable="false"
        />
        <span class="dev-profile__crop-hint">拖动调整位置 · 滚轮缩放</span>
        <button
          type="button"
          class="dev-profile__crop-reselect"
          @pointerdown.stop
          @click="inputRef?.click()"
        >
          重新选择
        </button>
      </div>
      <button v-else type="button" class="dev-profile__bg-pick" @click="inputRef?.click()">
        <span class="dev-profile__bg-pick-icon">＋</span>
        <span class="dev-profile__bg-pick-text"
          >选择{{ mode === 'dynamic' ? '动态背景' : '背景图片' }}</span
        >
      </button>
      <p class="dev-profile__bg-tip">
        {{
          mode === 'dynamic'
            ? '支持 MP4 / WebM 视频，或 GIF / WEBP 动图，最大 50MB'
            : '支持 PNG / JPG / WEBP / GIF，最大 5MB'
        }}
      </p>
    </div>
    <template #footer>
      <div class="dev-profile__background-dialog-actions">
        <TButton
          variant="text"
          tone="danger"
          v-if="hasBackground"
          class="dev-profile__background-dialog-remove"
          :loading="removing"
          @click="emit('remove')"
          >移除背景</TButton
        >
        <div class="dev-profile__background-dialog-actions-main">
          <TButton @click="open = false">取消</TButton>
          <TButton
            variant="solid"
            tone="accent"
            :disabled="!canSave || uploading || removing"
            :loading="uploading"
            @click="save"
            >保存</TButton
          >
        </div>
      </div>
    </template>
  </TDialog>
</template>

<style>
.dev-profile__bg-upload {
  display: grid;
  gap: 12px;
}

.dev-profile__bg-input {
  display: none;
}

.dev-profile__bg-pick {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 6;
  border: 1px dashed var(--dp-border-muted-50);
  border-radius: 12px;
  background: var(--dp-surface);
  color: var(--dp-text-muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  overflow: hidden;
  transition:
    border-color 0.18s ease,
    background 0.18s ease;
}

.dev-profile__bg-pick:hover {
  border-color: var(--dp-border-accent-50);
  background: var(--dp-accent-bg);
}

.dev-profile__bg-pick.has-preview {
  border-style: solid;
  border-color: var(--dp-border-accent-30);
  background: var(--dp-white);
}

.dev-profile__bg-preview {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.dev-profile__bg-video {
  background: var(--dp-ink);
}

.dev-profile__bg-pick-icon {
  font-size: 28px;
  line-height: 1;
}

.dev-profile__bg-pick-text {
  font-size: 14px;
}

/* 裁剪预览：16:6 固定比例，可拖动平移 + 滚轮缩放 */
.dev-profile__crop {
  position: relative;
  aspect-ratio: 16 / 6;
  overflow: hidden;
  border: 1px dashed var(--dp-border-muted-50);
  border-radius: 12px;
  background: var(--dp-surface);
  cursor: grab;
  touch-action: none;
}

.dev-profile__crop:active {
  cursor: grabbing;
}

.dev-profile__crop-media {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
  will-change: transform;
}

.dev-profile__crop-hint {
  position: absolute;
  left: 10px;
  bottom: 8px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--dp-scrim-55);
  color: var(--dp-white);
  font-size: 11px;
  pointer-events: none;
}

.dev-profile__crop-reselect {
  position: absolute;
  right: 10px;
  top: 8px;
  padding: 4px 10px;
  border: 1px solid var(--dp-white-60);
  border-radius: 999px;
  background: var(--dp-scrim-45);
  color: var(--dp-white);
  font-size: 12px;
  cursor: pointer;
}

.dev-profile__bg-repick {
  margin: 0;
  text-align: center;
}

.dev-profile__bg-tip {
  margin: 0;
  font-size: 12px;
  color: var(--dp-text-faint);
  text-align: center;
}

.dev-profile__background-dialog {
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--dp-border-accent-72);
  border-radius: 18px;
  box-shadow: 0 20px 48px var(--dp-shadow-deep);
}

.dev-profile__background-dialog-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dev-profile__background-dialog-actions-main {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

.dev-profile__background-dialog-remove {
  min-width: auto !important;
  padding: 0 8px;
  color: var(--dp-danger);
}

.dev-profile__background-dialog-remove:hover {
  background: var(--dp-danger-bg);
  color: var(--dp-danger-strong);
}
</style>
