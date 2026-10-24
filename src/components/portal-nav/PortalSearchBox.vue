<script setup lang="ts">
import { Close, Search, TIcon } from 'ui_73info'

import PortalSearchScope from '@/components/portal-nav/PortalSearchScope.vue'
import { usePortalTopNavSearch } from '@/composables/usePortalTopNavSearch'
import type { AuthMode } from '@/composables/usePortalTopNavNav'

// 搜索的跳转（搜索页 / 社区 / 工作台）与「未登录先登录」都在 composable 里，
// 这两个出口属于顶栏，由父组件注入，本组件不碰 router。
const props = defineProps<{
  openAuth: (mode: AuthMode) => void
  openDevWorkbench: () => void
}>()

const {
  searchQuery,
  searchScope,
  searchScopeOptions,
  searchScopeMenuOpen,
  searchInputFocused,
  searchInputHovered,
  searchHasInputValue,
  searchPlaceholder,
  activeSearchScopeLabel,
  toggleSearchScopeMenu,
  selectSearchScope,
  submitSearch,
  clearSearch,
  updateSearchDraftState,
  startSearchComposition,
  finishSearchComposition,
} = usePortalTopNavSearch({
  openAuth: (mode) => props.openAuth(mode),
  openDevWorkbench: () => props.openDevWorkbench(),
})
</script>

<template>
  <form
    class="portal-search"
    :class="{
      'is-filled': searchHasInputValue,
      'is-input-focused': searchInputFocused,
      'is-input-hovered': searchInputHovered,
    }"
    @submit.prevent="submitSearch"
  >
    <PortalSearchScope
      :scope="searchScope"
      :options="searchScopeOptions"
      :open="searchScopeMenuOpen"
      :label="activeSearchScopeLabel"
      @toggle="toggleSearchScopeMenu"
      @select="selectSearchScope"
    />
    <div
      class="portal-search-field"
      @mouseenter="searchInputHovered = true"
      @mouseleave="searchInputHovered = false"
    >
      <TIcon>
        <Search />
      </TIcon>
      <input
        v-model="searchQuery"
        type="search"
        inputmode="search"
        enterkeyhint="search"
        autocomplete="off"
        spellcheck="false"
        aria-label="顶部搜索"
        :placeholder="searchPlaceholder"
        @input="updateSearchDraftState"
        @compositionstart="startSearchComposition"
        @compositionupdate="updateSearchDraftState"
        @compositionend="finishSearchComposition"
        @focus="searchInputFocused = true"
        @blur="searchInputFocused = false"
        @keydown.esc="clearSearch"
      />
      <button
        class="portal-search-clear"
        :class="{ 'is-visible': Boolean(searchQuery) }"
        type="button"
        aria-label="清空搜索"
        :aria-hidden="!searchQuery"
        :disabled="!searchQuery"
        :tabindex="searchQuery ? 0 : -1"
        @click="clearSearch"
      >
        <TIcon>
          <Close />
        </TIcon>
      </button>
    </div>
  </form>
</template>

<style scoped>
.portal-search {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: 0 1 auto;
  gap: 9px;
  width: clamp(220px, 22vw, 320px);
  min-width: 0;
  padding: 0 10px 0 12px;
  min-height: 42px;
  border-radius: 999px;
  border: 1px solid var(--ptn-line);
  background: linear-gradient(180deg, var(--ptn-surface), var(--ptn-surface-sunken));
  box-shadow: inset 0 1px 0 var(--ptn-surface-highlight);
  color: var(--ptn-ink-muted);
  transition:
    width 300ms var(--portal-nav-motion),
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    color 160ms ease,
    transform 220ms var(--portal-nav-motion);
}

.portal-search:hover,
.portal-search:focus-within {
  border-color: var(--ptn-line-hover);
  background: var(--ptn-inverse);
}

.portal-search.is-input-focused,
.portal-search.is-input-hovered,
.portal-search.is-filled {
  border-color: var(--ptn-line-hover);
  background: var(--ptn-inverse);
}

.portal-search.is-filled {
  box-shadow: inset 0 1px 0 var(--ptn-surface-highlight);
}

.portal-search-field {
  display: inline-flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  gap: 9px;
  align-self: stretch;
}

.portal-search-field > .t73-icon {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  font-size: 18px;
  color: var(--73-ink-muted);
  transition: color 160ms ease;
}

.portal-search:hover .portal-search-field > .t73-icon,
.portal-search:focus-within .portal-search-field > .t73-icon,
.portal-search.is-input-focused .portal-search-field > .t73-icon,
.portal-search.is-input-hovered .portal-search-field > .t73-icon,
.portal-search.is-filled .portal-search-field > .t73-icon {
  color: var(--73-accent);
}

.portal-search input {
  flex: 1;
  min-width: 0;
  height: 40px;
  padding-right: 30px;
  border: 0;
  outline: 0;
  appearance: none;
  background: transparent;
  caret-color: var(--ptn-accent-brand);
  color: var(--ptn-ink-strong);
  font: inherit;
  font-size: 14px;
  line-height: 1.4;
  text-overflow: ellipsis;
}

.portal-search input::placeholder {
  color: var(--ptn-ink-placeholder);
  font-weight: 500;
}

.portal-search input::-webkit-search-cancel-button,
.portal-search input::-webkit-search-decoration {
  appearance: none;
  display: none;
}

.portal-search-clear {
  position: absolute;
  top: 50%;
  right: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--ptn-ink-placeholder);
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%);
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    color 160ms ease,
    opacity 160ms ease,
    transform 160ms ease;
}

.portal-search-clear.is-visible {
  opacity: 1;
  pointer-events: auto;
}

.portal-search-clear:disabled {
  cursor: default;
}

.portal-search-clear:hover {
  background: var(--ptn-neutral-wash);
  color: var(--ptn-ink-soft);
}

.portal-search-clear:active {
  transform: translateY(-50%) scale(0.96);
}

.portal-search-clear:focus-visible {
  outline: 3px solid var(--ptn-focus-halo);
  outline-offset: 2px;
}

/* 中窄屏：单行时由搜索框让出宽度，导航保持内容宽度不被压缩 */
@media (max-width: 1180px) {
  .portal-search {
    flex: 0 1 auto;
    width: 100%;
    max-width: 300px;
    min-width: 0;
  }
}

/* 再窄就放不下单行，顶栏退回两行：搜索框按视口取宽，给右侧按钮留出固定宽度 */
@media (max-width: 900px) {
  .portal-search {
    width: min(clamp(300px, 52vw, 620px), calc(100% - 240px));
    max-width: none;
  }
}

@media (max-width: 640px) {
  .portal-search {
    flex: 1 1 100%;
    width: 100%;
  }

  .portal-search:hover,
  .portal-search:focus-within,
  .portal-search.is-input-focused,
  .portal-search.is-input-hovered,
  .portal-search.is-filled {
    width: 100%;
    transform: none;
  }
}
</style>
