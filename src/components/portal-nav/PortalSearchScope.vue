<script setup lang="ts">
import type { SearchScope } from '@/composables/usePortalTopNavSearch'

// 搜索范围下拉：只渲染与发事件，选中的范围、开合状态都在 usePortalTopNavSearch 里
defineProps<{
  scope: SearchScope
  options: Array<{ value: SearchScope; label: string }>
  open: boolean
  label: string
}>()

const emit = defineEmits<{ toggle: []; select: [scope: SearchScope] }>()
</script>

<template>
  <!-- `@click.stop` 是「点外部关闭」能生效的前提：不拦住冒泡，点自己也会被 document 上的
       关闭逻辑当成「点了外面」，下拉会刚打开就收起。 -->
  <div class="portal-search-scope" @click.stop>
    <button
      class="portal-search-scope__trigger"
      type="button"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="emit('toggle')"
    >
      <span>{{ label }}</span>
    </button>
    <div v-if="open" class="portal-search-scope__menu" role="listbox" aria-label="搜索范围">
      <button
        v-for="option in options"
        :key="option.value"
        class="portal-search-scope__option"
        :class="{ active: option.value === scope }"
        type="button"
        role="option"
        :aria-selected="option.value === scope"
        @click="emit('select', option.value)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.portal-search-scope {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  min-width: 64px;
  padding-right: 9px;
  border-right: 1px solid var(--ptn-line-soft);
}

.portal-search-scope__trigger {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 58px;
  min-height: 32px;
  gap: 7px;
  padding: 0 17px 0 8px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--ptn-accent-brand);
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}

/* 用 0×0 的边框三角画下拉箭头，跟着 currentColor 变 */
.portal-search-scope__trigger::after {
  content: '';
  position: absolute;
  right: 6px;
  top: 50%;
  width: 0;
  height: 0;
  border-right: 4px solid transparent;
  border-left: 4px solid transparent;
  border-top: 5px solid currentColor;
  pointer-events: none;
  opacity: 0.56;
  transform: translateY(-25%);
  transition: transform 160ms ease;
}

.portal-search-scope__trigger[aria-expanded='true'] {
  background: var(--ptn-accent-tint-soft);
  color: var(--ptn-accent-ink);
}

.portal-search-scope__trigger[aria-expanded='true']::after {
  transform: translateY(-35%) rotate(180deg);
}

.portal-search-scope__trigger:hover,
.portal-search-scope__trigger:focus-visible {
  background: var(--ptn-accent-wash);
  color: var(--ptn-accent-ink);
  outline: none;
}

.portal-search-scope__menu {
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  z-index: 90;
  display: grid;
  width: 112px;
  gap: 4px;
  padding: 6px;
  border: 1px solid var(--ptn-line-accent);
  border-radius: 14px;
  background: var(--ptn-surface);
  box-shadow:
    0 18px 38px var(--ptn-focus-halo),
    0 4px 12px var(--ptn-shadow-soft);
  backdrop-filter: blur(14px);
}

.portal-search-scope__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--ptn-ink-body);
  font: inherit;
  font-size: 13px;
  font-weight: 750;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 140ms ease,
    color 140ms ease,
    transform 140ms ease;
}

/* 选中项右侧的小圆点：平时透明占位，选中时用 currentColor 填上 */
.portal-search-scope__option::after {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: transparent;
}

.portal-search-scope__option:hover,
.portal-search-scope__option:focus-visible {
  background: var(--ptn-accent-wash);
  color: var(--ptn-accent-ink);
  outline: none;
}

.portal-search-scope__option.active {
  background: var(--ptn-accent-gradient);
  color: var(--ptn-inverse);
  box-shadow: 0 8px 18px var(--ptn-accent-glow-18);
}

.portal-search-scope__option.active::after {
  background: currentColor;
}

@media (max-width: 640px) {
  .portal-search-scope {
    min-width: 58px;
    padding-right: 8px;
  }

  .portal-search-scope__trigger {
    min-width: 52px;
    padding-left: 6px;
    padding-right: 15px;
    font-size: 12px;
  }

  .portal-search-scope__menu {
    width: 104px;
  }
}
</style>
