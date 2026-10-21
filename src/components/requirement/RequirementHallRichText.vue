<script setup lang="ts">
/**
 * 需求详情里的富文本块（需求描述 / 验收标准两处共用）。
 *
 * 原件是 `views/RequirementHallView.vue` 里那段带 `v-html` 的 `article`：
 * 富文本的排版规则（段落间距、列表、代码块、图片与附件）只作用于注入的 HTML，
 * 所以跟着这一块一起搬过来，用 `:deep()` 命中那段 HTML。
 *
 * 外层的 `.requirement-hall-detail__review-value`（值框底色 / 圆角）仍留在对话框组件里：
 * 子组件根节点同时带父组件的 scope id，父级那条规则照样命中这个 `article`。
 */
defineProps<{
  /** 已经洗过一遍的 HTML（拼装与回退文案见 `@/shared/requirementDisplay`） */
  html: string
}>()
</script>

<template>
  <article
    class="requirement-hall-detail__review-value requirement-hall-detail__review-value--multiline requirement-hall-detail__rich"
    v-html="html"
  ></article>
</template>

<style scoped>
.requirement-hall-detail__rich {
  color: #334155;
  font-weight: 500;
  line-height: 1.75;
  overflow-wrap: anywhere;
}

.requirement-hall-detail__rich :deep(*:not(a)) {
  color: inherit;
}

.requirement-hall-detail__rich :deep(strong),
.requirement-hall-detail__rich :deep(b) {
  color: #1e293b;
  font-weight: 700;
}

.requirement-hall-detail__rich :deep(p),
.requirement-hall-detail__rich :deep(ul),
.requirement-hall-detail__rich :deep(ol),
.requirement-hall-detail__rich :deep(blockquote) {
  margin: 0 0 12px;
}

.requirement-hall-detail__rich :deep(ul),
.requirement-hall-detail__rich :deep(ol) {
  padding-left: 22px;
}

.requirement-hall-detail__rich :deep(a) {
  color: #2563eb;
  font-weight: 600;
}

.requirement-hall-detail__rich :deep(pre) {
  overflow-x: auto;
  padding: 14px 16px;
  border-radius: 14px;
  background: #0f172a;
  color: #e2e8f0;
}

.requirement-hall-detail__rich :deep(.rich-editor-media) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 12px 0;
  border-radius: 14px;
}

.requirement-hall-detail__rich :deep(.rich-editor-attachment) {
  display: inline-flex;
  max-width: 100%;
  margin: 8px 0;
  padding: 8px 12px;
  border: 1px solid rgba(191, 219, 254, 0.96);
  border-radius: 10px;
  background: rgba(239, 246, 255, 0.9);
  color: #1d4ed8;
  font-weight: 800;
  text-decoration: none;
}
</style>
