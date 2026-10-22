<script setup lang="ts">
import type { RequirementArchiveState } from '@/shared/requirementArchive'

/**
 * 合同有效期届满后的「超期锁定 / 已清除」横幅（R014）。
 *
 * 判定与文案来自 `shared/requirementArchive`，真值在后端；这里只负责渲染。
 */
defineProps<{
  banner: { state: RequirementArchiveState; title: string; description: string }
}>()
</script>

<template>
  <section
    class="archive-banner"
    :class="`archive-banner--${banner.state}`"
    role="status"
    data-testid="contract-archive-banner"
  >
    <strong>{{ banner.title }}</strong>
    <p>{{ banner.description }}</p>
  </section>
</template>

<style scoped>
/* R014：合同有效期届满进入锁定 / 已清除的横幅。锁定用琥珀提醒（限时保留），清除用中性灰（终态）。 */
.archive-banner {
  margin: 0 0 1rem;
  padding: 0.75rem 0.9rem;
  border-radius: 8px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
  line-height: 1.6;
}

.archive-banner--cleared {
  background: #f8fafc;
  border-color: #cbd5e1;
  color: #475569;
}

.archive-banner strong {
  display: block;
  font-weight: 800;
  margin-bottom: 0.25rem;
}

.archive-banner p {
  margin: 0;
  font-size: 0.9rem;
}
</style>
