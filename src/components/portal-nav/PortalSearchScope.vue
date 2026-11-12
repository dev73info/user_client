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
  min-width: 56px;
  padding-right: 8px;
  border-right: 1px solid var(--73-border);
}

.portal-search-scope__trigger {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 50px;
  min-height: 28px;
  gap: 7px;
  padding: 0 16px 0 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--73-ink-soft);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    color 160ms ease;
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
  background: var(--73-inset);
  color: var(--73-ink);
}

.portal-search-scope__trigger[aria-expanded='true']::after {
  transform: translateY(-35%) rotate(180deg);
}

.portal-search-scope__trigger:hover,
.portal-search-scope__trigger:focus-visible {
  background: var(--73-bg-soft);
  color: var(--73-ink);
  outline: none;
}

/* 宽度跟着选项文字走，至少与触发器对齐，不再写死像素值 */
.portal-search-scope__menu {
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  z-index: 90;
  display: grid;
  width: max-content;
  min-width: 100%;
  gap: 4px;
  padding: 6px;
  border: 1px solid var(--73-border);
  border-radius: var(--73-radius-control);
  background: var(--73-surface);
  box-shadow: var(--73-shadow-panel);
}

.portal-search-scope__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ptn-ink-body);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 140ms ease,
    color 140ms ease;
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
  background: var(--73-bg-soft);
  color: var(--73-ink);
  outline: none;
}

.portal-search-scope__option.active {
  background: var(--73-accent);
  color: var(--ptn-inverse);
  box-shadow: none;
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
}
</style>
