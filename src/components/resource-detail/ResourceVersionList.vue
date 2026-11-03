<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from 'vue'

import {
  extractResourceFileNameFromUrl,
  resolveResourceDownloadFileName,
  with73Extension,
  type PublicMcResourceVersionItem,
} from '@/api/resources'
import { fenToYuanText } from '@/shared/resourceSale'
import { useDownloadStore } from '@/stores/download'
import { formatHomepageContent } from '@/utils/resourceRichText'
import { formatResourceTime } from '@/utils/resourceTime'

/**
 * 历史版本列表（资源详情面板右栏那张卡）。
 *
 * 这一块是纯展示 + 一个出口：
 * - 取数仍在父级（`listPublicMcResourceVersions` 跟详情一次 `Promise.all` 拉回来），
 *   所以这里只吃 `versions`，自己不发请求、不碰令牌；
 * - 「下载」只 `emit('download', version)`，购买拦截 / 登录拦截 / 触发下载全在父级，
 *   免得这个组件也去拿 router 与 TMessage。
 *
 * 「下载中 x%」那一层是既有行为：父级把正在下的文件写进 `useDownloadStore`，
 * 这里按同一套文件名算法（URL 取名 → 兜底名 → 补 `.73` 后缀）比对当前这条版本，
 * 所以 `resourceId` / `resourceFileName` 只用来复刻兜底文件名，不参与取数。
 */
const props = defineProps<{
  versions: PublicMcResourceVersionItem[]
  /** 资源编号：只用于拼「下载中」比对用的兜底文件名 */
  resourceId: number
  /** 资源文件名：同上，兜底文件名的首选来源 */
  resourceFileName?: string
  /** 需要先购买：按钮文案换成「购买后下载」，点击交给父级去开购买弹窗 */
  needsPurchase: boolean
}>()

const emit = defineEmits<{ download: [version: PublicMcResourceVersionItem] }>()

const downloadStore = useDownloadStore()

/** 补充说明默认收起：一条一条展开，避免长说明把版本列表撑爆 */
const expandedVersionIds = ref<number[]>([])

function isVersionNoteExpanded(versionId: number): boolean {
  return expandedVersionIds.value.includes(versionId)
}

function toggleVersionNote(versionId: number) {
  const index = expandedVersionIds.value.indexOf(versionId)
  if (index >= 0) {
    expandedVersionIds.value.splice(index, 1)
  } else {
    expandedVersionIds.value.push(versionId)
  }
}

/**
 * 「展开 / 收起」只在说明真的超过两行时出现。
 * 说明默认带 `is-collapsed`（两行截断）；测量时临时摘掉这个类量一次自然高度，
 * 再在同一帧恢复，不会出现可见闪烁。容器宽度变化（窗口缩放 / 栏宽变化）时重测。
 */
const noteElements = new Map<number, HTMLElement>()
const overflowingNoteIds = ref<Set<number>>(new Set())
const listRef = ref<HTMLElement | null>(null)
let resizeObserver: ResizeObserver | null = null

function setNoteRef(el: Element | ComponentPublicInstance | null, versionId: number) {
  if (el instanceof HTMLElement) {
    noteElements.set(versionId, el)
  } else {
    noteElements.delete(versionId)
  }
}

function measureOverflow() {
  const next = new Set<number>()
  for (const [versionId, el] of noteElements) {
    const wasCollapsed = el.classList.contains('is-collapsed')
    if (wasCollapsed) {
      el.classList.remove('is-collapsed')
    }
    const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight)
    const overflows =
      Number.isFinite(lineHeight) && lineHeight > 0 ? el.scrollHeight > lineHeight * 2 + 0.5 : false
    if (wasCollapsed) {
      el.classList.add('is-collapsed')
    }
    if (overflows) {
      next.add(versionId)
    }
  }
  const prev = overflowingNoteIds.value
  if (next.size !== prev.size || [...next].some((id) => !prev.has(id))) {
    overflowingNoteIds.value = next
  }
}

onMounted(() => {
  void nextTick(measureOverflow)
  if (typeof ResizeObserver !== 'undefined' && listRef.value) {
    resizeObserver = new ResizeObserver(() => measureOverflow())
    resizeObserver.observe(listRef.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  noteElements.clear()
})

watch(
  () => props.versions,
  () => {
    void nextTick(measureOverflow)
  },
)

/** 这条版本下载下来会叫什么名字——与父级触发下载时用的算法必须一致，否则「下载中」永远对不上 */
function versionFileName(version: PublicMcResourceVersionItem): string {
  return with73Extension(
    extractResourceFileNameFromUrl(
      version.resource,
      resolveResourceDownloadFileName(
        props.resourceFileName,
        `resource-${props.resourceId}-v${version.id}`,
      ),
    ),
  )
}

/**
 * 版本价标签：契约里 `purchasable` 是「单版本价大于 0」的判定结果，
 * 两者都为真才展示金额；买断资源这里一律不出现价格。
 */
function versionPriceLabel(version: PublicMcResourceVersionItem): string {
  if (!version.purchasable || version.price_fen <= 0) {
    return ''
  }
  return `单版本 ¥${fenToYuanText(version.price_fen)}`
}

function downloadLabel(version: PublicMcResourceVersionItem): string {
  if (props.needsPurchase) {
    return '购买后下载'
  }
  if (downloadStore.state.active && downloadStore.state.fileName === versionFileName(version)) {
    return `下载中 ${downloadStore.state.percent}%`
  }
  return '下载'
}
</script>

<template>
  <article class="resource-detail-page__content-card resource-detail-page__versions-side-card">
    <header class="resource-detail-page__section-head">
      <h2>历史版本</h2>
      <span v-if="versions.length" class="resource-detail-page__section-count">
        {{ versions.length }} 个构建
      </span>
    </header>
    <div v-if="versions.length" ref="listRef" class="resource-detail-page__version-list">
      <article
        v-for="version in versions"
        :key="version.id"
        class="resource-detail-page__version-card"
      >
        <div class="resource-detail-page__version-headline">
          <div class="resource-detail-page__version-meta">
            <strong>{{ version.version }}</strong>
            <span>{{ formatResourceTime(version.created_at) }}</span>
          </div>
          <div class="resource-detail-page__version-flags">
            <span v-if="version.is_current" class="resource-detail-page__version-current"
              >当前版本</span
            >
            <span v-if="versionPriceLabel(version)" class="resource-detail-page__version-price">{{
              versionPriceLabel(version)
            }}</span>
          </div>
        </div>
        <button
          v-if="version.note && overflowingNoteIds.has(version.id)"
          class="resource-detail-page__version-note-toggle"
          type="button"
          @click="toggleVersionNote(version.id)"
        >
          {{ isVersionNoteExpanded(version.id) ? '收起' : '展开' }}
        </button>
        <div class="resource-detail-page__version-note-wrap">
          <div
            v-if="version.note"
            :ref="(el) => setNoteRef(el, version.id)"
            class="resource-detail-page__version-note"
            :class="{ 'is-collapsed': !isVersionNoteExpanded(version.id) }"
            v-html="formatHomepageContent(version.note)"
          ></div>
          <p v-else class="resource-detail-page__paragraph">当前版本暂无补充说明。</p>
        </div>
        <div class="resource-detail-page__version-actions">
          <button
            class="resource-detail-page__version-download"
            type="button"
            :disabled="downloadStore.state.active"
            @click="emit('download', version)"
          >
            {{ downloadLabel(version) }}
          </button>
        </div>
      </article>
    </div>
    <p v-else class="resource-detail-page__paragraph">当前还没有可展示的历史版本。</p>
  </article>
</template>

<style scoped>
/* 历史版本卡：与详情页其他卡片同一套工作台样式。
   版本行不再各自成卡——整块一张白卡，版本行之间用 1px 分割线。 */

.resource-detail-page__section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--73-border-soft);
}

.resource-detail-page__section-head h2 {
  margin: 0;
  color: var(--73-ink);
  font-size: 16px;
  font-weight: 600;
}

.resource-detail-page__section-head span {
  color: var(--73-ink-muted);
  font-size: 11px;
}

.resource-detail-page__version-list {
  display: flex;
  flex-direction: column;
}

.resource-detail-page__version-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 0;
  border: 0;
  border-top: 1px solid var(--73-border-soft);
  border-radius: 0;
  background: transparent;
}

.resource-detail-page__version-card:first-child {
  padding-top: 0;
  border-top: 0;
}

.resource-detail-page__version-headline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.resource-detail-page__version-meta {
  display: inline-flex;
  align-items: baseline;
  justify-content: flex-start;
  gap: 8px;
  min-width: 0;
}

.resource-detail-page__version-meta strong {
  color: var(--73-ink);
  font-family: var(--73-font-family-mono);
  font-size: 12px;
  font-weight: 600;
}

.resource-detail-page__version-meta span {
  margin: 0;
  color: var(--73-ink-muted);
  font-size: 10px;
  line-height: 1.4;
}

.resource-detail-page__version-flags {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: 6px;
}

.resource-detail-page__version-current {
  padding: 1px 6px;
  border: 1px solid var(--73-success-line);
  border-radius: 4px;
  background: var(--73-success-soft);
  color: var(--73-success-text);
  font-size: 10px;
  font-weight: 500;
}

.resource-detail-page__version-price {
  padding: 1px 6px;
  border: 1px solid var(--73-accent-line);
  border-radius: 4px;
  background: var(--73-accent-soft);
  color: var(--73-accent);
  font-size: 10px;
}

.resource-detail-page__version-note-toggle {
  align-self: flex-start;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--73-accent);
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}

.resource-detail-page__version-note-toggle:hover {
  text-decoration: underline;
}

.resource-detail-page__version-note-wrap {
  margin-top: 0;
}

.resource-detail-page__version-note {
  margin: 0;
  color: var(--73-ink-soft);
  font-size: 12px;
  line-height: 1.6;
}

.resource-detail-page__version-note :deep(p),
.resource-detail-page__version-note :deep(ul),
.resource-detail-page__version-note :deep(ol),
.resource-detail-page__version-note :deep(blockquote) {
  margin: 4px 0;
  color: var(--73-ink-soft);
  font-size: 12px;
  line-height: 1.6;
}

.resource-detail-page__version-note :deep(p:first-child),
.resource-detail-page__version-note :deep(ul:first-child),
.resource-detail-page__version-note :deep(ol:first-child),
.resource-detail-page__version-note :deep(blockquote:first-child) {
  margin-top: 0;
}

.resource-detail-page__version-note :deep(p:last-child),
.resource-detail-page__version-note :deep(ul:last-child),
.resource-detail-page__version-note :deep(ol:last-child),
.resource-detail-page__version-note :deep(blockquote:last-child) {
  margin-bottom: 0;
}

.resource-detail-page__version-note.is-collapsed {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.resource-detail-page__version-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 2px;
}

.resource-detail-page__version-download {
  height: 30px;
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid var(--73-border);
  border-radius: var(--73-radius-control);
  background: var(--73-surface);
  color: var(--73-ink);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color var(--73-transition),
    border-color var(--73-transition);
}

.resource-detail-page__version-download:hover {
  border-color: var(--73-border-hover);
  background: var(--73-bg-soft);
}

.resource-detail-page__version-download:disabled {
  opacity: 0.55;
  cursor: wait;
}

.resource-detail-page__paragraph {
  margin: 0;
  color: var(--73-ink-muted);
  font-size: 12px;
}

@media (max-width: 640px) {
  .resource-detail-page__version-headline {
    align-items: flex-start;
  }
}
</style>
