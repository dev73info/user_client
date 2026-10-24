<script setup lang="ts">
/**
 * 签署记录（只读）。
 *
 * 文案换算在 `shared/contractSign.signingLogLabel`，这里只渲染 `{ 时间, 说明 }`。
 */
defineProps<{
  logs: Array<{ id: number; time: string; label: string }>
}>()
</script>

<template>
  <section class="signature-history">
    <h3>签署记录</h3>
    <p v-if="!logs.length" class="empty-log">暂无签署记录</p>
    <ol v-else>
      <li v-for="log in logs" :key="log.id">
        <time>{{ log.time }}</time>
        <span>{{ log.label }}</span>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.signature-history {
  margin: 24px 0;
  border-top: 1px solid var(--73-border);
  padding-top: 24px;
}

.signature-history h3 {
  font-size: 15px;
  margin: 0 0 16px;
}

.signature-history ol {
  list-style: none;
  padding: 0;
  margin: 0;
}

.signature-history li {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr);
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--73-surface-strong);
  font-size: 13px;
}

.signature-history time {
  color: var(--73-ink-muted);
}

.empty-log {
  color: var(--73-ink-soft);
}

@media (max-width: 640px) {
  .signature-history li {
    grid-template-columns: 1fr;
    gap: 6px;
  }
}
</style>
