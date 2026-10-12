<script setup lang="ts">
import { computed, nextTick, ref, type ComponentPublicInstance } from 'vue'

import {
  RESOURCE_LISTING_SALE_OPTIONS,
  type ResourceListingSale,
} from '@/shared/resourceSale'

const props = withDefaults(
  defineProps<{
    /** 当前分区：`free` / `paid` */
    modelValue: ResourceListingSale
    label?: string
    /** 两个分区的资源计数（本地数据算出来的，不额外请求）；缺省时不显示计数 */
    counts?: { free: number; paid: number } | null
  }>(),
  { label: '资源类型切换', counts: null },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: ResourceListingSale): void
}>()

const optionRefs = ref<HTMLButtonElement[]>([])

const hasCounts = computed(() => props.counts !== null && props.counts !== undefined)

function countOf(value: ResourceListingSale): number {
  if (!props.counts) {
    return 0
  }
  return value === 'free' ? props.counts.free : props.counts.paid
}

function setOptionRef(el: Element | ComponentPublicInstance | null, index: number) {
  if (el instanceof HTMLButtonElement) {
    optionRefs.value[index] = el
  }
}

function select(value: ResourceListingSale) {
  if (value === props.modelValue) {
    return
  }

  emit('update:modelValue', value)
}

/** 键盘左右切换分区并把焦点带到新选项上（滑块跟着动，不用鼠标也能换） */
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
    return
  }

  event.preventDefault()
  const total = RESOURCE_LISTING_SALE_OPTIONS.length
  const currentIndex = RESOURCE_LISTING_SALE_OPTIONS.findIndex(
    (option) => option.value === props.modelValue,
  )
  const step = event.key === 'ArrowRight' ? 1 : -1
  const nextIndex = (currentIndex + step + total) % total
  const nextOption = RESOURCE_LISTING_SALE_OPTIONS[nextIndex]
  if (!nextOption) {
    return
  }

  select(nextOption.value)
  void nextTick(() => optionRefs.value[nextIndex]?.focus())
}
</script>

<template>
  <div class="resource-mode-switch" role="group" :aria-label="label" @keydown="onKeydown">
    <!-- 滑块只负责动效与选中底色，点击一律落在上面的两个按钮上 -->
    <span
      class="resource-mode-switch__thumb"
      :class="{ 'is-paid': modelValue === 'paid' }"
      aria-hidden="true"
    />
    <button
      v-for="(option, index) in RESOURCE_LISTING_SALE_OPTIONS"
      :key="option.value"
      :ref="(el) => setOptionRef(el, index)"
      class="resource-mode-switch__option"
      :class="{
        'is-active': modelValue === option.value,
        'is-empty': hasCounts && countOf(option.value) === 0,
      }"
      type="button"
      :aria-pressed="modelValue === option.value"
      @click="select(option.value)"
    >
      <span class="resource-mode-switch__label">{{ option.label }}</span>
      <span v-if="hasCounts" class="resource-mode-switch__count">{{ countOf(option.value) }}</span>
    </button>
  </div>
</template>

<style scoped>
/* 免费 / 付费的页内分段切换。桌面工具栏与移动端列表共用同一份外观：
   胶囊轨道 + 一枚滑块。滑块用门户强调色 `--accent`（设计方案「令牌与档位」把强调蓝
   限定在三处：当前分区滑块 / 主按钮 / 选中下划线；本轮口径是**不用渐变、不用阴影**），
   只有 180ms 的位移过渡，不加多余装饰。
   每段带计数（本地算，切分区仍是零请求）；计数为 0 时置灰但仍可点，方便查看空态。 */
.resource-mode-switch {
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: center;
  padding: 4px;
  border-radius: 999px;
  border: 1px solid var(--card-border);
  background: var(--bg-mid);
}

.resource-mode-switch__thumb {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: calc(50% - 4px);
  border-radius: 999px;
  background: var(--accent);
  pointer-events: none;
  transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.resource-mode-switch__thumb.is-paid {
  transform: translateX(100%);
}

.resource-mode-switch__option {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 92px;
  height: 32px;
  padding: 0 16px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #475569;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: color 180ms ease;
}

.resource-mode-switch__count {
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
}

.resource-mode-switch__option.is-empty:not(.is-active) {
  color: #94a3b8;
}

.resource-mode-switch__option:hover {
  color: var(--accent);
}

.resource-mode-switch__option:focus-visible {
  outline: 3px solid rgba(37, 99, 235, 0.16);
  outline-offset: 2px;
}

.resource-mode-switch__option.is-active {
  color: #fff;
}

.resource-mode-switch__option.is-active:hover {
  color: #fff;
}

@media (max-width: 900px) {
  /* 移动端整行铺开（外层给宽度），选项不再撑最小宽度 */
  .resource-mode-switch__option {
    min-width: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .resource-mode-switch__thumb {
    transition: none;
  }
}
</style>
