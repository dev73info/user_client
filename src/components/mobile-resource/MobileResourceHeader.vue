<script setup lang="ts">
import { computed } from 'vue'
import {
  ArrowDown,
  Menu as MenuIcon,
  Search,
  TDropdown,
  TDropdownItem,
  TDropdownMenu,
  TIcon,
} from 'ui_73info'
import ResourceModeSwitch from '@/components/ResourceModeSwitch.vue'
import { DEFAULT_RESOURCE_LISTING_SALE, type ResourceListingSale } from '@/shared/resourceSale'

/**
 * 移动端资源列表顶栏：筛选菜单入口、搜索框、排序下拉，以及下面那行免费 / 付费分段。
 *
 * 从 `MobileResourceList.vue` 的模板里整块搬出来，结构与文案未改。搜索词与排序仍是
 * 列表自己的状态（筛选与排序都发生在列表的派生数据上），这里通过 `update:` 事件回写。
 */
const props = defineProps<{
  sortMode: 'latest' | 'like'
  keyword: string
  /** 免费 / 付费分区：由页内分段切换写入，这里只做展示 */
  listingMode?: ResourceListingSale | null
  counts: { free: number; paid: number }
}>()

const emit = defineEmits<{
  'open-menu': []
  'update:sortMode': [value: 'latest' | 'like']
  'update:keyword': [value: string]
  'switch-listing-mode': [value: ResourceListingSale]
}>()

/** 搜索框用可写 computed 接 `v-model`：与原来一样只改 DOM 属性、不额外落 `value` 属性。 */
const keywordModel = computed({
  get: () => props.keyword,
  set: (value: string) => emit('update:keyword', value),
})
</script>

<template>
  <header class="mobile-resource-header">
    <button
      class="mobile-resource-menu-btn"
      type="button"
      aria-label="打开筛选菜单"
      @click="emit('open-menu')"
    >
      <TIcon>
        <MenuIcon />
      </TIcon>
      <span>筛选</span>
    </button>
    <form class="mobile-search-form" @submit.prevent>
      <TIcon class="mobile-search-icon">
        <Search />
      </TIcon>
      <input
        v-model="keywordModel"
        class="mobile-search-input"
        type="search"
        placeholder="搜索公开资源..."
      />
    </form>
    <div>
      <TDropdown
        trigger="click"
        placement="bottom-end"
        @command="(cmd) => emit('update:sortMode', cmd as 'latest' | 'like')"
      >
        <button class="mobile-sort-btn" type="button">
          <TIcon>
            <ArrowDown />
          </TIcon>
          <span>{{ props.sortMode === 'like' ? '点赞' : '最新' }}</span>
        </button>
        <template #dropdown>
          <TDropdownMenu>
            <TDropdownItem command="latest" :class="{ 'is-active': props.sortMode === 'latest' }">
              最新
            </TDropdownItem>
            <TDropdownItem command="like" :class="{ 'is-active': props.sortMode === 'like' }">
              点赞
            </TDropdownItem>
          </TDropdownMenu>
        </template>
      </TDropdown>
    </div>
  </header>

  <!-- 免费 / 付费分区切换：与桌面工具栏同一枚分段控件，移动端整行铺开便于点按 -->
  <div class="mobile-mode-row">
    <ResourceModeSwitch
      :model-value="props.listingMode ?? DEFAULT_RESOURCE_LISTING_SALE"
      :counts="props.counts"
      @update:model-value="(mode) => emit('switch-listing-mode', mode)"
    />
  </div>
</template>

<style scoped src="./mobile-resource-header.css"></style>
