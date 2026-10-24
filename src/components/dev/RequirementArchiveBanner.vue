<script setup lang="ts">
import { computed } from 'vue'
import {
  requirementArchiveBannerView,
  type RequirementDetailFacts,
} from '@/shared/devRequirementDetail'

/**
 * R014：合同有效期届满进入锁定 / 已清除后的横幅。
 *
 * 判定与文案在 `shared/requirementArchive`（真值在后端），这里只负责画；
 * 正常态 `title` 为空串，整块不渲染。
 *
 * 配色样式留在 `DevRequirementDetailView.vue` 的 scoped 块里：这套琥珀 / 中性灰是本页独有的
 * 裸色值（已在 `frontend-baseline.json` 按文件登记），搬进组件会新增一处基线违规；
 * 父级 scoped 样式对子组件根元素同样生效，所以改由视图那边命中这个 `<section>`。
 */
const props = defineProps<{
  requirement: RequirementDetailFacts | null
}>()

const banner = computed(() => requirementArchiveBannerView(props.requirement))
</script>

<template>
  <section
    v-if="banner.title"
    class="dev-archive-banner"
    :class="`dev-archive-banner--${banner.state}`"
    role="status"
    data-testid="dev-requirement-archive-banner"
  >
    <strong>{{ banner.title }}</strong>
    <p>{{ banner.description }}</p>
  </section>
</template>
