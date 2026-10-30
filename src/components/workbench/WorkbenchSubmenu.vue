<script setup lang="ts">
/**
 * 侧边栏的折叠子菜单容器：分组子项与消息中心共用。
 *
 * 从 `views/UserWorkbenchView.vue` 抽出来。两者的盒模型（左侧缩进 + 竖线 + 行距）与折叠动画
 * 完全一致，只有消息中心那一档是固定高度、自己带滚动条（`--messages`），所以收在一个组件里，
 * `@media` 与动画也跟着它搬。
 */
defineProps<{
  open: boolean
  /** default = 分组子项（420px 档）；messages = 消息中心（230px 档，内部滚动）。 */
  variant?: 'default' | 'messages'
}>()
</script>

<template>
  <Transition name="workbench-submenu">
    <div
      v-show="open"
      class="user-workbench__submenu"
      :class="{ 'user-workbench__submenu--messages': variant === 'messages' }"
    >
      <slot />
    </div>
  </Transition>
</template>

<style scoped>
.user-workbench__submenu {
  --workbench-submenu-max: 420px;

  display: grid;
  gap: 6px;
  margin-left: 38px;
  padding-left: 10px;
  border-left: 1px solid var(--uw-line);
}

/* 折叠动画：靠 max-height 从 0 撑到子菜单的实际高度档位（同组子项数量决定不了高度，取固定档） */
.workbench-submenu-enter-active,
.workbench-submenu-leave-active {
  max-height: var(--workbench-submenu-max, 420px);
  opacity: 1;
  overflow: hidden;
  transform-origin: top;
  transition:
    max-height 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 160ms ease,
    transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.workbench-submenu-enter-from,
.workbench-submenu-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-4px) scaleY(0.98);
}

.workbench-submenu-enter-to,
.workbench-submenu-leave-from {
  max-height: var(--workbench-submenu-max, 420px);
  opacity: 1;
  transform: translateY(0) scaleY(1);
}

/* 消息中心那一档：固定高度、内部滚动，滚动条用细档的蓝→青渐变 */
.user-workbench__submenu--messages {
  --workbench-submenu-max: 230px;

  max-height: 210px;
  overflow-y: auto;
  padding-right: 4px;
  scrollbar-color: var(--uw-scroll-a) transparent;
  scrollbar-width: thin;
}

.user-workbench__submenu--messages::-webkit-scrollbar {
  width: 8px;
}

.user-workbench__submenu--messages::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}

.user-workbench__submenu--messages::-webkit-scrollbar-track {
  background: transparent;
}

.user-workbench__submenu--messages::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: linear-gradient(180deg, var(--uw-scroll-a), var(--uw-scroll-b));
}

.user-workbench__submenu--messages::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, var(--uw-scroll-a-hover), var(--uw-scroll-b-hover));
}

@media (max-width: 900px) {
  .user-workbench__submenu {
    gap: 2px;
    margin: 2px 0 4px 32px;
    padding: 4px;
    border-left: 0;
    border-radius: 14px;
    background: color-mix(in srgb, var(--uw-blue-wash-faint) 52%, transparent);
  }

  .user-workbench__submenu :deep(.user-workbench__submenu-link) {
    min-height: 34px;
    padding: 6px 10px;
    border-radius: 10px;
  }

  .user-workbench__submenu :deep(.user-workbench__submenu-link > span) {
    font-size: 13px;
    font-weight: 700;
  }

  .user-workbench__submenu--messages {
    max-height: 160px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .workbench-submenu-enter-active,
  .workbench-submenu-leave-active {
    transition: none;
  }
}
</style>
