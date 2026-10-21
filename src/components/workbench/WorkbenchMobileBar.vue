<script setup lang="ts">
import { Menu as MenuIcon, TIcon } from 'ui_73info'

import { WORKBENCH_BAR_SLOT_ID, workbenchBarSlotCount } from '@/shared/workbenchBarSlot'

/**
 * 移动端顶栏（900px 及以下才有）：菜单按钮 + 品牌标题 + 当前页名 + 页面读数插槽。
 *
 * 从 `views/UserWorkbenchView.vue` 抽出来。断点与抽屉同一档（见 `useWorkbenchMobileMenu`），
 * 页面用 `WorkbenchBarSlot` 往 `WORKBENCH_BAR_SLOT_ID` 里 teleport 读数，塞了读数就顶替标题。
 */
defineProps<{
  workbenchModeKey: string
  workbenchBrandTitle: string
  currentTitle: string
}>()

const emit = defineEmits<{
  (event: 'open-menu'): void
}>()
</script>

<template>
  <div
    class="user-workbench__mobile-bar"
    :class="{ 'user-workbench__mobile-bar--slotted': workbenchBarSlotCount > 0 }"
  >
    <button
      class="user-workbench__mobile-menu-btn"
      type="button"
      aria-label="打开工作台菜单"
      @click="emit('open-menu')"
    >
      <TIcon>
        <MenuIcon />
      </TIcon>
      <span>菜单</span>
    </button>
    <div class="user-workbench__mobile-title">
      <Transition name="workbench-brand-title" mode="out-in">
        <strong :key="workbenchModeKey">{{ workbenchBrandTitle }}</strong>
      </Transition>
      <span>{{ currentTitle }}</span>
    </div>
    <!-- 页面经 WorkbenchBarSlot 传进来的顶部读数（顶替标题）；没有时不占位 -->
    <div :id="WORKBENCH_BAR_SLOT_ID" class="user-workbench__mobile-bar-extra" />
  </div>
</template>

<style scoped>
.user-workbench__mobile-bar {
  display: none;
}

.user-workbench__mobile-menu-btn {
  border: 0;
  font: inherit;
  cursor: pointer;
}

/* 标题换模式时的文字淡入：与品牌行同一套（scoped 不跨组件，样式各留一份） */
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
  .user-workbench__mobile-bar {
    position: sticky;
    top: 8px;
    z-index: 12;
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    margin: 8px 0 12px;
    height: auto;
    min-height: 66px;
    padding: 12px;
    border: 1px solid var(--uw-surface-line);
    border-radius: 16px;
    background: var(--uw-surface);
    box-shadow: var(--uw-bar-shadow);
    flex-wrap: wrap;
  }

  .user-workbench__mobile-bar > div {
    display: grid;
    gap: 2px;
    flex: 1 1 auto;
    min-width: 0;
  }

  .user-workbench__mobile-bar > .user-workbench__mobile-bar-extra {
    display: none;
  }

  /* 页面经 WorkbenchBarSlot 塞了读数进来时，读数顶替标题，与「菜单」同排 */
  .user-workbench__mobile-bar--slotted {
    flex-wrap: nowrap;
  }

  .user-workbench__mobile-bar--slotted > .user-workbench__mobile-title {
    display: none;
  }

  .user-workbench__mobile-bar--slotted > .user-workbench__mobile-bar-extra {
    display: block;
    flex: 1 1 auto;
    min-width: 0;
  }

  .user-workbench__mobile-bar strong,
  .user-workbench__mobile-bar span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .user-workbench__mobile-bar strong {
    color: var(--uw-ink-strong);
    font-size: 15px;
    line-height: 1.2;
  }

  .user-workbench__mobile-bar span {
    color: var(--73-ink-muted);
    font-size: 12px;
    font-weight: 700;
    line-height: 1.2;
  }

  .user-workbench__mobile-menu-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
    min-height: 38px;
    padding: 0 12px;
    border-radius: 12px;
    background: var(--uw-blue-fill);
    color: var(--uw-blue-ink);
    font-size: 13px;
    font-weight: 800;
  }

  /* 顶栏塞了读数时，「菜单」只留图标，把宽度让给读数（按钮自带 aria-label） */
  .user-workbench__mobile-bar--slotted .user-workbench__mobile-menu-btn {
    justify-content: center;
    width: 36px;
    min-height: 36px;
    padding: 0;
    font-size: 18px;
  }

  .user-workbench__mobile-bar--slotted .user-workbench__mobile-menu-btn > span:not(.t73-icon) {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .workbench-brand-title-enter-active,
  .workbench-brand-title-leave-active {
    transition: none;
  }
}
</style>
