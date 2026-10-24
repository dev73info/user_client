<script setup lang="ts">
import type { RequirementItem } from '@/api/requirements'
import type { PublicMcResourceVersionItem } from '@/api/resources'
import { requirementRichTextPlainText } from '@/utils/requirementRichText'

/**
 * 下载版本选择器：行内「下载」先弹这个，让用户自己挑要哪一版。
 *
 * 纯展示：版本列表（`useMyRequirementsData` 的按条 map）、下载中状态与下载请求都在视图，
 * 弹窗只 emit `download`——下载进度与「准备中...」的置灰靠 `downloading` 一个布尔。
 *
 * 样式原本是视图 scoped 块里的 `.download-picker*`，因为裸色值过不了设计令牌门禁，
 * 逐条搬进 `styles/profile.css`（选择器与视觉一字不改）；组件自身不带 scoped 块。
 */
const props = defineProps<{
  /** 空值即关闭：打开态由「有没有选中需求」表示，与原来 `v-if` 同一判据。 */
  requirement: RequirementItem | null
  versions: PublicMcResourceVersionItem[]
  /** 本需求的资源正在下载（按钮统一置灰 + 文案换成「准备中...」）。 */
  downloading: boolean
}>()

const emit = defineEmits<{
  close: []
  download: [version: PublicMcResourceVersionItem]
}>()

/** 版本说明是富文本，列表里只要纯文本（与原视图同一个转换函数）。 */
function noteText(note?: string | null) {
  return requirementRichTextPlainText(note ?? '')
}
</script>

<template>
  <div v-if="props.requirement" class="modal-wrap" @click.self="emit('close')">
    <section class="pay-modal" aria-label="选择下载版本">
      <h3>选择要下载的版本</h3>
      <p class="pay-line"><strong>需求标题：</strong>{{ props.requirement.title }}</p>
      <ul class="download-picker">
        <li v-for="version in props.versions" :key="version.id" class="download-picker__item">
          <div class="download-picker__meta">
            <strong>{{ version.version }}</strong>
            <small>{{ version.created_at }}</small>
            <p v-if="noteText(version.note)">{{ noteText(version.note) }}</p>
          </div>
          <button
            class="ghost small"
            type="button"
            :disabled="props.downloading"
            @click="emit('download', version)"
          >
            {{ props.downloading ? '准备中...' : '下载' }}
          </button>
        </li>
      </ul>
      <div class="actions">
        <button class="ghost" type="button" @click="emit('close')">关闭</button>
      </div>
    </section>
  </div>
</template>
