<script setup lang="ts">
import { ref } from 'vue'

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
      <span>Versions</span>
    </header>
    <div v-if="versions.length" class="resource-detail-page__version-list">
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
          v-if="version.note"
          class="resource-detail-page__version-note-toggle"
          type="button"
          @click="toggleVersionNote(version.id)"
        >
          {{ isVersionNoteExpanded(version.id) ? '收起' : '展开' }}
        </button>
        <div class="resource-detail-page__version-note-wrap">
          <p
            v-if="version.note"
            class="resource-detail-page__version-note"
            :class="{ 'is-collapsed': !isVersionNoteExpanded(version.id) }"
            v-html="formatHomepageContent(version.note)"
          ></p>
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
/* 色值全部取父级声明的 `--rdp-*`（`raw-color` 门禁按文件聚合，新文件里不许出现裸色值）。
   断点沿用 640 / 900 / 1180 三档。 */

/* 段落头：与父级「页面内容 / 资源评论」两块同一套观感——scoped 规则不跨组件作用域，这里留一份。
   原父级是「headline-row / cta-row / version-headline / version-meta / section-head」五合一的那条
   flex 规则，拆开后把落在本组件里的三只（version-headline / version-meta / section-head）合成一条。 */
.resource-detail-page__version-headline,
.resource-detail-page__version-meta,
.resource-detail-page__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.resource-detail-page__section-head {
  align-items: baseline;
  margin-bottom: 16px;
}

.resource-detail-page__section-head h2 {
  margin: 0;
  color: var(--rdp-ink);
}

.resource-detail-page__section-head span {
  font-size: 12px;
}

.resource-detail-page__version-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: min(680px, calc(100vh - 220px));
  overflow-y: auto;
  padding-right: 8px;
  scrollbar-gutter: stable;
}

.resource-detail-page__version-card {
  border-radius: 18px;
  padding: 18px 18px 5px;
  border: 1px solid var(--rdp-card-border);
  background: var(--rdp-card-surface);
}

.resource-detail-page__version-note-wrap {
  margin-top: 4px;
}

.resource-detail-page__version-note {
  margin: 0;
  color: var(--rdp-body);
  line-height: 1.8;
}

.resource-detail-page__version-note :deep(p),
.resource-detail-page__version-note :deep(ul),
.resource-detail-page__version-note :deep(ol),
.resource-detail-page__version-note :deep(blockquote) {
  color: var(--rdp-body);
  line-height: 1.8;
  margin: 8px 0;
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

.resource-detail-page__version-note :deep(code) {
  color: var(--rdp-ink);
}

.resource-detail-page__version-note.is-collapsed {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.resource-detail-page__version-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  margin-top: 5px;
  padding-top: 5px;
  border-top: 1px solid var(--rdp-hairline);
}

.resource-detail-page__version-note-toggle {
  position: sticky;
  top: 8px;
  float: right;
  margin: -25px 0 8px 12px;
  padding: 4px 14px;
  border: none;
  border-radius: 999px;
  background: var(--rdp-toggle-bg);
  color: var(--rdp-muted);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
  cursor: pointer;
  transition: background-color 0.2s;
  white-space: nowrap;
  z-index: 2;
}

.resource-detail-page__version-note-toggle:hover {
  background: var(--rdp-toggle-bg-hover);
}

.resource-detail-page__version-meta strong {
  color: var(--rdp-ink);
}

.resource-detail-page__version-flags {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.resource-detail-page__version-current {
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--rdp-soft-surface);
  color: var(--rdp-link);
  font-size: 12px;
  font-weight: 700;
}

.resource-detail-page__version-price {
  color: var(--rdp-muted);
  font-size: 12px;
}

/* 次要文本：原父级与 `__meta` / `__summary` 共用一条，落在本组件的是版本时间与空态提示 */
.resource-detail-page__version-meta span,
.resource-detail-page__paragraph {
  margin: 0;
  color: var(--rdp-muted);
  line-height: 1.8;
}

/* 下载按钮：描边 / 光标 / 过渡原与主按钮共用一条，主按钮留在父级，这里留自己这份 */
.resource-detail-page__version-download {
  border: 0;
  cursor: pointer;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    background-color 180ms ease;
  color: var(--rdp-link);
  background: var(--rdp-soft-surface);
  font-weight: 700;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 10px;
  font-size: 13px;
}

.resource-detail-page__version-download:hover {
  transform: translateY(-1px);
}

@media (max-width: 640px) {
  .resource-detail-page__version-list {
    max-height: min(520px, calc(100vh - 260px));
  }

  .resource-detail-page__version-headline {
    align-items: flex-start;
  }
}

/* 内嵌形态（资源列表页内容区）里版本列表不跟着页面无限拉长：超过 420px 由它自己滚。
   祖先类 `.resource-detail-page--panel` 在父级根节点上，scoped 只给最后一段加属性，所以这条照样命中；
   顺序必须留在 640 档之后（原父级也是这样，panel 档权重更高、要压掉 640 的 max-height）。 */
.resource-detail-page--panel .resource-detail-page__version-list {
  max-height: 420px;
}
</style>
