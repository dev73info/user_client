<script setup lang="ts">
import { ref, watch } from 'vue'
import { Close, TIcon } from 'ui_73info'
import type {
  EntryOption,
  RootOption,
  SectionView,
} from '@/components/mobile-resource/mobileResourceModel'

/**
 * 移动端资源列表的筛选抽屉：一级 / 二级节点下拉、可折叠的标签分组、底部重置与应用。
 *
 * 从 `MobileResourceList.vue` 的模板里整块搬出来，结构与文案未改。筛选状态（每组的已选标签、
 * 展开态）仍是列表自己的——派生数据要按它过滤——所以这里只回写事件；抽屉自己只留两个
 * 下拉的开关，并在关闭时收起（对应原来 `closeMenu()` 里顺手关下拉的那一步）。
 */
const props = defineProps<{
  open: boolean
  rootSlug: string
  entrySlug: string
  rootOptions: RootOption[]
  entryOptions: EntryOption[]
  currentRootLabel: string
  currentEntryLabel: string
  sections: SectionView[]
  expandedSectionIds: number[]
}>()

const emit = defineEmits<{
  close: []
  'select-root': [option: RootOption]
  'select-entry': [option: EntryOption]
  'toggle-section': [sectionId: number]
  'toggle-tag': [sectionId: number, tag: string]
  reset: []
  apply: []
}>()

const rootDropdownOpen = ref(false)
const entryDropdownOpen = ref(false)

function isSectionExpanded(sectionId: number): boolean {
  return props.expandedSectionIds.includes(sectionId)
}

function toggleRootDropdown() {
  rootDropdownOpen.value = !rootDropdownOpen.value
  if (rootDropdownOpen.value) {
    entryDropdownOpen.value = false
  }
}

function toggleEntryDropdown() {
  entryDropdownOpen.value = !entryDropdownOpen.value
  if (entryDropdownOpen.value) {
    rootDropdownOpen.value = false
  }
}

function selectRoot(option: RootOption) {
  rootDropdownOpen.value = false
  entryDropdownOpen.value = false
  emit('select-root', option)
}

function selectEntry(option: EntryOption) {
  entryDropdownOpen.value = false
  emit('select-entry', option)
}

// 抽屉关闭时顺手收起两个下拉（原来由父级的 closeMenu 一起做）
watch(
  () => props.open,
  (open) => {
    if (!open) {
      rootDropdownOpen.value = false
      entryDropdownOpen.value = false
    }
  },
)
</script>

<template>
  <aside class="mobile-menu-drawer" aria-label="筛选菜单" :aria-hidden="!props.open">
    <section class="mobile-menu-drawer-shell">
      <header class="mobile-menu-head">
        <div class="mobile-menu-head-copy">
          <strong>筛选</strong>
        </div>
        <button
          class="mobile-menu-drawer-close"
          type="button"
          aria-label="关闭筛选菜单"
          @click="emit('close')"
        >
          <TIcon>
            <Close />
          </TIcon>
        </button>
      </header>

      <div class="mobile-menu-body">
        <div class="mobile-level-row">
          <div class="mobile-level-item">
            <button type="button" class="mobile-level-trigger" @click="toggleRootDropdown">
              <strong>{{ props.currentRootLabel }}</strong>
            </button>
            <div v-if="rootDropdownOpen" class="mobile-level-options">
              <button
                v-for="option in props.rootOptions"
                :key="option.key"
                type="button"
                class="mobile-level-option"
                :class="{ 'mobile-level-option--active': option.key === props.rootSlug }"
                @click="selectRoot(option)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>

          <div class="mobile-level-item">
            <button type="button" class="mobile-level-trigger" @click="toggleEntryDropdown">
              <strong>{{ props.currentEntryLabel }}</strong>
            </button>
            <div v-if="entryDropdownOpen" class="mobile-level-options">
              <button
                v-for="option in props.entryOptions"
                :key="option.key"
                type="button"
                class="mobile-level-option"
                :class="{ 'mobile-level-option--active': option.key === props.entrySlug }"
                @click="selectEntry(option)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
        </div>

        <section
          v-for="section in props.sections"
          :key="section.id"
          class="mobile-menu-group"
          :class="{
            'mobile-menu-group--open': isSectionExpanded(section.id),
            'mobile-menu-group--active': section.selected.length > 0,
          }"
        >
          <button
            type="button"
            class="mobile-menu-group-trigger"
            :aria-expanded="isSectionExpanded(section.id)"
            @click="emit('toggle-section', section.id)"
          >
            <span class="mobile-menu-group-title">{{ section.label }}</span>
            <span v-if="section.selected.length > 0" class="mobile-menu-group-count">
              {{ section.selected.length }}
            </span>
            <span class="mobile-menu-group-chevron" aria-hidden="true" />
          </button>
          <div
            class="mobile-menu-group-panel"
            :class="{ 'mobile-menu-group-panel--open': isSectionExpanded(section.id) }"
          >
            <div class="mobile-menu-group-body">
              <div class="mobile-chip-row">
                <button
                  v-for="tag in section.tags"
                  :key="tag"
                  type="button"
                  :class="[
                    'mobile-chip',
                    { 'mobile-chip--active': section.selected.includes(tag) },
                  ]"
                  @click.stop="emit('toggle-tag', section.id, tag)"
                >
                  {{ tag }}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <footer class="mobile-menu-foot">
        <button type="button" class="mobile-foot-btn mobile-foot-btn--ghost" @click="emit('reset')">
          重置
        </button>
        <button
          type="button"
          class="mobile-foot-btn mobile-foot-btn--primary"
          @click="emit('apply')"
        >
          应用筛选
        </button>
      </footer>
    </section>
  </aside>
</template>

<style scoped src="./mobile-resource-drawer.css"></style>

<style scoped src="./mobile-resource-drawer-filters.css"></style>
