<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { TIcon, Aim, Check, Close } from 'ui_73info'

/**
 * 头像裁剪弹窗：**只渲染、只 emit**。
 *
 * 一、样式整段跟着组件走。弹窗渲染在 `Teleport to body` 里，全局 `modal.css` 只给 `.modal-wrap` /
 *     `.pay-modal` 的骨架，那两百行细节（含 `@media (max-width: 640px)` 的单列布局）全靠本文件的
 *     scoped 样式命中——漏一段，弹窗就是裸的，而且线上没人会点开看。
 * 二、不碰 router / TMessage / `@/api/*`：缩放、拖拽的判定与「保存头像」的请求都在 `useAvatarCrop`，
 *     这里只把 `close` / `reset` / `submit` 三个口子 emit 出去（挂点见 `useAvatarCropModalBindings`）。
 * 三、`.profile-avatar-crop-action .t73-icon` 靠「子组件根节点继承父 scope id」命中，
 *     所以按钮里不要再套包裹层，否则图标尺寸那条规则失效。
 */
defineProps<{
  visible: boolean
  previewUrl: string
  /** 图片的 `width` / `height` / `transform`，由 `avatarCropImageStyle` 算好，组件只管贴上去。 */
  imageStyle: Record<string, string>
  dragging: boolean
  zoomPercent: number
  hasImage: boolean
  uploading: boolean
  /** 舞台元素回填（函数 ref）：量框宽与指针捕获都要它。 */
  registerFrame: (el: Element | ComponentPublicInstance | null) => void
  handleImageLoad: (event: Event) => void
  handleWheel: (event: WheelEvent) => void
  handlePointerDown: (event: PointerEvent) => void
  handlePointerMove: (event: PointerEvent) => void
  handlePointerUp: (event: PointerEvent) => void
}>()

const emit = defineEmits<{
  close: []
  /** 居中复位（倍数与位移归零），判定在 `useAvatarCrop.resetFrame`。 */
  reset: []
  submit: []
}>()
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-wrap modal-wrap--avatar-crop" @click.self="emit('close')">
      <section class="pay-modal profile-avatar-crop-modal" aria-label="头像裁剪弹窗">
        <div class="profile-avatar-crop-header">
          <h3>头像裁剪</h3>
          <button class="ghost small" type="button" :disabled="uploading" @click="emit('close')">
            关闭
          </button>
        </div>

        <div class="profile-avatar-crop-body">
          <div class="profile-avatar-crop-stage-wrap">
            <div
              :ref="registerFrame"
              class="profile-avatar-crop-stage"
              :class="{ 'is-dragging': dragging }"
              @pointerdown="handlePointerDown"
              @pointermove="handlePointerMove"
              @pointerup="handlePointerUp"
              @pointercancel="handlePointerUp"
              @wheel.prevent="handleWheel"
            >
              <img
                v-if="previewUrl"
                class="profile-avatar-crop-image"
                :src="previewUrl"
                :style="imageStyle"
                alt="头像裁剪预览"
                draggable="false"
                @load="handleImageLoad"
              />
              <span class="profile-avatar-crop-ring" aria-hidden="true"></span>
            </div>
          </div>

          <div class="profile-avatar-crop-controls">
            <div class="profile-avatar-crop-zoom">缩放 {{ zoomPercent }}%</div>
            <div class="profile-avatar-crop-actions">
              <button
                class="ghost small profile-avatar-crop-action profile-avatar-crop-action--utility"
                type="button"
                :disabled="uploading || !hasImage"
                @click="emit('reset')"
              >
                <TIcon>
                  <Aim />
                </TIcon>
                <span>居中</span>
              </button>
              <button
                class="ghost small profile-avatar-crop-action profile-avatar-crop-action--cancel"
                type="button"
                :disabled="uploading"
                @click="emit('close')"
              >
                <TIcon>
                  <Close />
                </TIcon>
                <span>取消</span>
              </button>
              <button
                class="ghost small profile-avatar-crop-action profile-avatar-crop-action--primary"
                type="button"
                :disabled="uploading || !hasImage"
                @click="emit('submit')"
              >
                <TIcon v-if="!uploading">
                  <Check />
                </TIcon>
                {{ uploading ? '上传中...' : '保存头像' }}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
/* 这 200 行是 Teleport 出去的弹窗自己的样式：全局 modal.css 只给骨架，漏一段弹窗就裸。 */
.modal-wrap--avatar-crop {
  --profile-card-bg: color-mix(in srgb, var(--73-surface-strong) 94%, transparent);
  --profile-card-bg-strong: var(--73-surface-strong);
  --profile-card-border: color-mix(in srgb, var(--73-accent-soft) 96%, transparent);
  --profile-card-shadow: 0 14px 34px color-mix(in srgb, var(--73-accent) 8%, transparent);
  --profile-text-main: var(--73-ink);
  --profile-text-sub: var(--73-ink-muted);
  --profile-accent: var(--73-accent);
  background: color-mix(in srgb, var(--73-ink) 26%, transparent);
  backdrop-filter: blur(4px);
  z-index: 120;
}

.profile-avatar-crop-modal {
  width: min(720px, calc(100vw - 36px));
  padding: 0;
  overflow: hidden;
  border-color: color-mix(in srgb, var(--73-accent-soft) 95%, transparent);
  background: var(--73-surface-strong);
  box-shadow: 0 26px 70px color-mix(in srgb, var(--73-accent) 18%, transparent);
}

.profile-avatar-crop-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid color-mix(in srgb, var(--73-accent-soft) 90%, transparent);
  background: linear-gradient(180deg, var(--73-surface-strong) 0%, var(--73-accent-soft) 100%);
}

.profile-avatar-crop-header h3 {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
}

.profile-avatar-crop-body {
  display: grid;
  grid-template-columns: minmax(300px, 368px) minmax(0, 1fr);
  gap: 22px;
  align-items: center;
  padding: 22px;
}

.profile-avatar-crop-stage-wrap {
  display: grid;
  place-items: center;
  padding: 16px;
  border: 1px solid color-mix(in srgb, var(--73-accent-soft) 90%, transparent);
  border-radius: 24px;
  background: linear-gradient(135deg, var(--73-accent-soft) 0%, var(--73-surface-strong) 100%);
}

.profile-avatar-crop-stage {
  position: relative;
  width: min(320px, 100%);
  aspect-ratio: 1;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--73-accent) 95%, transparent);
  border-radius: 50%;
  background: linear-gradient(135deg, var(--73-accent-soft), var(--73-surface-strong));
  box-shadow: 0 18px 38px color-mix(in srgb, var(--73-accent) 18%, transparent);
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.profile-avatar-crop-stage.is-dragging {
  cursor: grabbing;
}

.profile-avatar-crop-image {
  position: absolute;
  top: 0;
  left: 0;
  display: block;
  max-width: none;
  transform-origin: top left;
  pointer-events: none;
  user-select: none;
}

.profile-avatar-crop-ring {
  position: absolute;
  inset: 0;
  border: 2px solid color-mix(in srgb, var(--73-surface-strong) 90%, transparent);
  border-radius: inherit;
  box-shadow:
    inset 0 0 0 999px color-mix(in srgb, var(--73-ink) 2%, transparent),
    inset 0 0 24px color-mix(in srgb, var(--73-ink) 14%, transparent);
  pointer-events: none;
}

.profile-avatar-crop-controls {
  display: grid;
  gap: 16px;
  min-width: 0;
  align-content: center;
}

.profile-avatar-crop-zoom {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  width: fit-content;
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--73-accent-soft) 95%, transparent);
  border-radius: 999px;
  background: var(--73-accent-soft);
  color: var(--profile-text-sub);
  font-size: 14px;
  font-weight: 800;
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--73-surface-strong) 95%, transparent);
}

.profile-avatar-crop-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.modal-wrap--avatar-crop button.ghost,
.modal-wrap--avatar-crop button.ghost.small {
  border-color: color-mix(in srgb, var(--73-accent-soft) 95%, transparent);
  background: var(--73-surface-strong);
  color: var(--profile-text-main);
  box-shadow: 0 8px 20px color-mix(in srgb, var(--73-accent) 6%, transparent);
}

.modal-wrap--avatar-crop button.ghost:hover:not(:disabled) {
  background: var(--73-accent-soft);
  border-color: color-mix(in srgb, var(--73-accent) 92%, transparent);
  box-shadow: 0 12px 24px color-mix(in srgb, var(--73-accent) 10%, transparent);
}

.profile-avatar-crop-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 40px;
  min-width: 76px;
  line-height: 1;
  white-space: nowrap;
}

.profile-avatar-crop-action .t73-icon {
  flex: 0 0 auto;
  font-size: 15px;
}

.modal-wrap--avatar-crop .profile-avatar-crop-action--utility.ghost {
  border-color: color-mix(in srgb, var(--73-accent) 90%, transparent);
  background: var(--73-accent-soft);
  color: var(--73-accent);
  box-shadow: 0 8px 18px color-mix(in srgb, var(--73-accent) 8%, transparent);
}

.modal-wrap--avatar-crop .profile-avatar-crop-action--cancel.ghost {
  border-color: color-mix(in srgb, var(--73-ink-disabled) 95%, transparent);
  background: var(--73-surface-strong);
  color: var(--73-ink-muted);
  box-shadow: none;
}

.modal-wrap--avatar-crop .profile-avatar-crop-action--primary.ghost {
  min-width: 116px;
  border-color: color-mix(in srgb, var(--73-accent) 95%, transparent);
  background: linear-gradient(135deg, var(--73-accent) 0%, var(--73-accent) 100%);
  color: var(--73-surface-strong);
  box-shadow: 0 12px 24px color-mix(in srgb, var(--73-accent) 22%, transparent);
}

.modal-wrap--avatar-crop .profile-avatar-crop-action--utility.ghost:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--73-accent) 95%, transparent);
  background: var(--73-accent-soft);
  box-shadow: 0 12px 24px color-mix(in srgb, var(--73-accent) 12%, transparent);
}

.modal-wrap--avatar-crop .profile-avatar-crop-action--cancel.ghost:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--73-ink-placeholder) 95%, transparent);
  background: var(--73-surface-strong);
  color: var(--73-ink-soft);
  box-shadow: 0 10px 20px color-mix(in srgb, var(--73-ink-muted) 10%, transparent);
}

.modal-wrap--avatar-crop .profile-avatar-crop-action--primary.ghost:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--73-accent) 98%, transparent);
  background: linear-gradient(135deg, var(--73-accent) 0%, var(--73-accent) 100%);
  box-shadow: 0 16px 30px color-mix(in srgb, var(--73-accent) 28%, transparent);
}

@media (max-width: 640px) {
  .profile-avatar-crop-body {
    grid-template-columns: 1fr;
  }

  .profile-avatar-crop-zoom {
    width: 100%;
  }

  .profile-avatar-crop-actions .ghost.small {
    flex: 1 1 120px;
  }
}
</style>
