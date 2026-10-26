<script setup lang="ts">
import { ref } from 'vue'
import { useMultiSelectTags } from '@/composables/useMultiSelectTags'
import type { FilterSectionView } from '@/components/resource-catalog/resourceCatalogModel'

/**
 * 桌面资源列表左侧的标签筛选菜单：可折叠分组、组内多选（长按拖动连选）、单组「清空」。
 *
 * 从 `ResourceCatalog.vue` 的模板里整块搬出来，结构与文案未改。已选标签仍是列表的状态
 * （派生列表要按它过滤），这里只回写；分组展开态只影响本菜单，跟着一起搬了过来。
 * 长按多选那套指针手势由 `useMultiSelectTags` 提供，手势本身与原来一致：拖动过程中在
 * 同一数组上就地增减，点一下则交给列表去切换该标签。
 */
const props = defineProps<{
  sections: FilterSectionView[]
}>()

const emit = defineEmits<{
  'toggle-tag': [sectionId: number, tag: string]
  'clear-section': [sectionId: number]
}>()

const expandedSectionIds = ref<number[]>([])

const { onTagPointerDown, onTagPointerEnter, onTagPointerUp, onTagPointerCancel, onTagClick } =
  useMultiSelectTags()

function isSectionExpanded(sectionId: number) {
  return expandedSectionIds.value.includes(sectionId)
}

function toggleSection(sectionId: number) {
  if (isSectionExpanded(sectionId)) {
    expandedSectionIds.value = expandedSectionIds.value.filter((id) => id !== sectionId)
    return
  }

  expandedSectionIds.value = [...expandedSectionIds.value, sectionId]
}

/** 点一下标签：交给列表切换（长按拖动按下文的手势走，不经过这里） */
function handleTagClick(section: FilterSectionView, tag: string) {
  onTagClick(section.selected, tag, () => emit('toggle-tag', section.id, tag))
}
</script>

<template>
  <section v-if="props.sections.length > 0" class="portal-resource-browser__filters">
    <nav class="portal-resource-browser__menu" aria-label="标签筛选菜单">
      <section
        v-for="section in props.sections"
        :key="section.id"
        class="portal-resource-browser__menu-group"
        :class="{
          'portal-resource-browser__menu-group--open': isSectionExpanded(section.id),
          'portal-resource-browser__menu-group--active': section.selected.length > 0,
        }"
      >
        <div class="portal-resource-browser__menu-head">
          <button
            class="portal-resource-browser__menu-trigger"
            type="button"
            @click="toggleSection(section.id)"
            :aria-expanded="isSectionExpanded(section.id)"
            :class="{
              'portal-resource-browser__menu-trigger--active': section.selected.length > 0,
            }"
          >
            <span class="portal-resource-browser__menu-title">{{ section.label }}</span>
            <span v-if="section.selected.length > 0" class="portal-resource-browser__menu-badge">
              {{ section.selected.length }}
            </span>
          </button>
          <button
            v-if="section.selected.length > 0"
            class="portal-resource-browser__menu-clear"
            type="button"
            :aria-label="`清空「${section.label}」筛选`"
            @click="emit('clear-section', section.id)"
          >
            清空
          </button>
        </div>

        <div v-show="isSectionExpanded(section.id)" class="portal-resource-browser__submenu">
          <button
            v-for="tag in section.tags"
            :key="tag"
            class="portal-resource-browser__submenu-link"
            :class="{
              'portal-resource-browser__submenu-link--active': section.selected.includes(tag),
            }"
            @pointerdown="onTagPointerDown(section.selected, tag, $event)"
            @pointerenter="onTagPointerEnter(section.selected, tag)"
            @pointerup="onTagPointerUp"
            @pointercancel="onTagPointerCancel"
            @click="handleTagClick(section, tag)"
          >
            {{ tag }}
          </button>
        </div>
      </section>
    </nav>
  </section>
</template>

<style scoped src="./resource-catalog-filters.css"></style>
