<script setup lang="ts">
import { computed } from 'vue'
import type { ResourceListingSale } from '@/shared/resourceSale'

/**
 * 移动端资源列表的空态：标题与说明跟着「有没有筛选」与「当前分区」变，
 * 下面三条出口是清筛选 / 换分区 / 发布需求（与桌面同一套）。
 *
 * 从 `MobileResourceList.vue` 的模板里整块搬出来，文案与判断未改；
 * 分区文案与「另一侧是谁」由当前分区推出来，跟着空态一起搬了过来。
 */
const props = defineProps<{
  hasActiveFilters: boolean
  /** 免费 / 付费分区：由页内分段切换写入 */
  listingMode?: ResourceListingSale | null
}>()

const emit = defineEmits<{
  reset: []
  'switch-listing-mode': [value: ResourceListingSale]
  publish: []
}>()

const activeListingLabel = computed(() => (props.listingMode === 'paid' ? '付费资源' : '免费资源'))

/** 空态「换分区」出口的目标：就是另一侧 */
const otherListingMode = computed<ResourceListingSale>(() =>
  props.listingMode === 'paid' ? 'free' : 'paid',
)

const otherListingLabel = computed(() =>
  otherListingMode.value === 'paid' ? '付费资源' : '免费资源',
)
</script>

<template>
  <div class="mobile-empty">
    <strong>{{
      props.hasActiveFilters ? '当前筛选下暂无资源' : `还没有${activeListingLabel}`
    }}</strong>
    <span>
      {{
        props.hasActiveFilters
          ? '可以去掉筛选条件，或换个分区看看。'
          : `${activeListingLabel}这一分区暂时还没有公开内容，可以换个分区，或自己发布一条需求。`
      }}
    </span>
    <div class="mobile-empty-actions">
      <button
        v-if="props.hasActiveFilters"
        type="button"
        class="mobile-empty-btn mobile-empty-btn--primary"
        @click="emit('reset')"
      >
        清除全部筛选
      </button>
      <button
        type="button"
        class="mobile-empty-btn"
        @click="emit('switch-listing-mode', otherListingMode)"
      >
        看看{{ otherListingLabel }}
      </button>
      <button
        type="button"
        class="mobile-empty-btn mobile-empty-btn--ghost"
        @click="emit('publish')"
      >
        发布需求
      </button>
    </div>
  </div>
</template>

<style scoped src="./mobile-resource-empty.css"></style>
