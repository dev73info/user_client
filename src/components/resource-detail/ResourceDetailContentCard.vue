<script setup lang="ts">
import { ref } from 'vue'
import { TMessage } from 'ui_73info'
import { useCodeBlockCopy } from '@/composables/useCodeBlockCopy'

/**
 * 资源详情面板里的「页面内容」卡：把已渲染好的富文本 HTML 落进 `v-html`，
 * 空内容时给一句占位。代码块的一键复制（`useCodeBlockCopy`）也随正文节点一起搬到这里——
 * 它挂的是正文容器的 `rootRef`，跟着节点走才不会失效。
 *
 * 从 `ResourceDetailPanel.vue` 整块搬出来；正文排版仍在全局样式
 * `styles/resource-rich-text.css`（`v-html` 产物没有 `data-v`），色板留在
 * `resource-detail-content.css` 里由继承下发。
 */
const props = defineProps<{
  /** `formatHomepageContent(release_note)` 的产物，空串表示没有额外说明 */
  html: string
}>()

const pageContentRef = ref<HTMLElement | null>(null)

useCodeBlockCopy({
  rootRef: pageContentRef,
  notify: (message, type) => {
    if (type) {
      TMessage[type](message)
      return
    }
    TMessage.info(message)
  },
})
</script>

<template>
  <article class="resource-detail-page__content-card">
    <header class="resource-detail-page__section-head">
      <h2>页面内容</h2>
      <span>Content</span>
    </header>
    <div
      v-if="props.html"
      ref="pageContentRef"
      class="resource-detail-page__content-flow resource-detail-page__rich-text rich-text-body"
      v-html="props.html"
    />
    <p v-else class="resource-detail-page__paragraph">
      当前还没有额外补充说明。后续更新、兼容性说明或使用建议会展示在这里。
    </p>
  </article>
</template>

<style scoped src="./resource-detail-content.css"></style>
