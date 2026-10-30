<script setup lang="ts">
import { Close, Grid, Switch as SwitchIcon, TIcon } from 'ui_73info'

/**
 * 侧边栏品牌行：字标 + 标题 + 切换工作台 + （移动端）关闭抽屉。
 *
 * 从 `views/UserWorkbenchView.vue` 抽出来。两侧工作台共用同一套品牌行，
 * 用户端文案是「我的工作台」，标题与字标在模式切换时轻微交叉淡入。
 */
defineProps<{
  isDevWorkbenchMode: boolean
  /** 过渡用的模式 key：切模式时标题整块换掉。 */
  workbenchModeKey: string
  workbenchBrandTitle: string
  modeSwitching: boolean
  modeSwitchSpinning: boolean
}>()

const emit = defineEmits<{
  (event: 'switch-mode'): void
  (event: 'close-menu'): void
}>()
</script>

<template>
  <div class="user-workbench__brand">
    <span class="user-workbench__brand-mark" aria-hidden="true">
      <TIcon>
        <Grid />
      </TIcon>
    </span>
    <!-- 侧边栏标题用普通标题样式，模式切换按钮靠右；Transition 包在标题内部，保持品牌行直系子节点结构 -->
    <strong class="user-workbench__brand-title">
      <Transition name="workbench-brand-title" mode="out-in">
        <span :key="workbenchModeKey">{{ workbenchBrandTitle }}</span>
      </Transition>
    </strong>
    <!-- 两侧工作台共用同一颗「切换工作台」按钮，避免一边长文一边只剩图标 -->
    <button
      class="user-workbench__mode-switch"
      type="button"
      :class="{ 'user-workbench__mode-switch--spin': modeSwitchSpinning }"
      :title="isDevWorkbenchMode ? '回到用户工作台' : '进入开发者工作台'"
      :aria-label="isDevWorkbenchMode ? '回到用户工作台' : '进入开发者工作台'"
      :disabled="modeSwitching"
      :aria-busy="modeSwitching || undefined"
      @click="emit('switch-mode')"
    >
      <TIcon>
        <SwitchIcon />
      </TIcon>
      <span>切换工作台</span>
    </button>
    <button
      class="user-workbench__drawer-close"
      type="button"
      aria-label="关闭工作台菜单"
      @click="emit('close-menu')"
    >
      <TIcon>
        <Close />
      </TIcon>
    </button>
  </div>
</template>

<style scoped>
.user-workbench__brand {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  /* 左右不再留内边距：右边缘与下方菜单项对齐 */
  padding: 4px 0 10px;
  border-bottom: 1px solid var(--uw-line-faint);
}

/* 品牌字标：小方块 + 图标，与标题同排；用户 / 开发者两侧共用 */
.user-workbench__brand-mark {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: var(--uw-blue-fill);
  color: var(--uw-blue-ink);
  font-size: 14px;
}

/* 品牌行标题：普通标题样式，空间不足时省略号截断 */
.user-workbench__brand-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--uw-ink-strong);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-workbench__brand-title > span {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  color: inherit;
  font: inherit;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.user-workbench__brand span {
  color: var(--uw-blue-bright);
  font-size: 12px;
  font-weight: 500;
}

.user-workbench__brand em {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  min-height: 26px;
  padding: 4px 9px;
  border-radius: 999px;
  background: var(--uw-blue-wash);
  color: var(--uw-blue-ink);
  font-size: 12px;
  font-style: normal;
  font-weight: 500;
}

.user-workbench__drawer-close {
  display: none;
}

.user-workbench__drawer-close {
  border: 0;
  font: inherit;
  cursor: pointer;
}

/* 工作台模式切换：用户菜单与开发者菜单之间来回切，在品牌行里靠右 */
.user-workbench__mode-switch {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  margin-left: auto;
  min-height: 26px;
  padding: 0 9px;
  border: 1px solid var(--uw-blue-line);
  border-radius: 999px;
  background: var(--uw-blue-wash-faint);
  color: var(--uw-blue-ink);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition:
    border-color 180ms ease,
    background 180ms ease,
    transform 180ms ease,
    opacity 160ms ease;
}

.user-workbench__mode-switch:hover,
.user-workbench__mode-switch:focus-visible {
  border-color: var(--uw-blue-line-hover);
  background: var(--uw-blue-fill-strong);
}

.user-workbench__mode-switch:active:not(:disabled) {
  transform: scale(0.96);
}

.user-workbench__mode-switch:disabled {
  cursor: wait;
  opacity: 0.78;
}

.user-workbench__mode-switch--spin :deep(.t73-icon),
.user-workbench__mode-switch--spin :deep(svg) {
  animation: workbench-mode-spin 360ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes workbench-mode-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(180deg);
  }
}

/* 品牌标题 / 字标在模式切换时轻微交叉淡入 */
.workbench-brand-title-enter-active,
.workbench-brand-title-leave-active {
  transition:
    opacity 160ms ease,
    transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.workbench-brand-title-enter-from {
  opacity: 0;
  transform: translateY(3px);
}

.workbench-brand-title-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}

@media (max-width: 900px) {
  .user-workbench__drawer-close {
    display: inline-grid;
    place-items: center;
    flex: 0 0 auto;
    width: 32px;
    height: 32px;
    border-radius: 11px;
    background: var(--uw-blue-wash);
    color: var(--uw-blue-ink);
  }

  /* 抽屉里的模式切换与关闭按钮同高，便于手指点击 */
  .user-workbench__mode-switch {
    min-height: 32px;
    padding: 0 11px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .user-workbench__mode-switch,
  .workbench-brand-title-enter-active,
  .workbench-brand-title-leave-active {
    transition: none;
  }

  .user-workbench__mode-switch--spin :deep(.t73-icon),
  .user-workbench__mode-switch--spin :deep(svg) {
    animation: none;
  }
}
</style>
