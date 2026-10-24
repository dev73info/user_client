<script setup lang="ts">
/**
 * 「我的需求」页顶部的四格读数条 + 页面级刷新按钮。
 *
 * 纯展示：读数由外面算好传进来，点刷新只派发 `refresh`，不发任何请求。
 * 移动端由 `WorkbenchBarSlot` 把整条搬进工作台顶栏（Teleport），桌面端原地渲染。
 */
import { computed } from 'vue'

import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import type { RequirementBucketSummary } from '@/shared/requirementStatus'
import { Refresh, TButton, TIcon } from 'ui_73info'

const props = defineProps<{
  /** 四格读数：全部 / 审核 / 开发 / 完成 */
  stats: RequirementBucketSummary
  /** 列表或会话在加载：读数暂不报数，刷新按钮转圈 */
  loading: boolean
}>()

const emit = defineEmits<{ refresh: [] }>()

/* 读数在加载中不报数：重新加载会先清空列表，直接显示 0 会被读成「一条需求都没有」。 */
function stripValue(count: number) {
  return props.loading ? '—' : String(count)
}

/** 刷新按钮只有一个图标，加载态与说明都靠 aria-label / title 承载。 */
const refreshButtonLabel = computed(() => (props.loading ? '刷新中...' : '刷新'))
</script>

<template>
  <!-- 顶部读数条：四格读数在最左，页面级刷新固定在右上角，与其余菜单页同一套形状 -->
  <WorkbenchBarSlot>
    <div class="wb-strip my-requirements-strip" aria-label="需求概览">
      <div class="wb-strip__item" title="全部需求">
        <span class="wb-strip__label">全部</span>
        <span class="wb-strip__value">{{ stripValue(stats.total) }}</span>
      </div>
      <div class="wb-strip__divider" />
      <div class="wb-strip__item" title="审核中：待审核、已驳回">
        <span class="wb-strip__label">审核</span>
        <span class="wb-strip__value">{{ stripValue(stats.pending) }}</span>
      </div>
      <div class="wb-strip__divider" />
      <div class="wb-strip__item" title="开发中：待签署、待付定金、开发中、待付尾款">
        <span class="wb-strip__label">开发</span>
        <span class="wb-strip__value">{{ stripValue(stats.active) }}</span>
      </div>
      <div class="wb-strip__divider" />
      <div class="wb-strip__item" title="已完成：可评价、已完成、已取消">
        <span class="wb-strip__label">完成</span>
        <span class="wb-strip__value">{{ stripValue(stats.completed) }}</span>
      </div>
      <div class="wb-strip__item wb-strip__action">
        <TButton
          icon-only
          :loading="props.loading"
          :aria-label="refreshButtonLabel"
          :title="refreshButtonLabel"
          @click="emit('refresh')"
        >
          <TIcon><Refresh /></TIcon>
        </TButton>
      </div>
    </div>
  </WorkbenchBarSlot>
</template>

<style scoped>
/* 移动端读数条被 Teleport 进顶栏后按四格重排。
   这段必须待在**读数条自己**的组件里：scoped 规则靠 `data-v` 命中 `.my-requirements-strip`，
   读数条一搬出视图，视图那份 scoped 规则就再也匹配不上（移动端四格会塌成一行）。 */
@media (max-width: 640px) {
  /* 操作槽只剩刷新，钉在顶栏右侧，四组读数才排得进一行 */
  /* 四组读数均分四格，文字在上、数字在下 */
  #workbench-mobile-bar-extra .my-requirements-strip {
    position: relative;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0;
    padding-right: 32px;
  }
  #workbench-mobile-bar-extra .my-requirements-strip .wb-strip__item:not(.wb-strip__action) {
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-width: 0;
  }
  #workbench-mobile-bar-extra .my-requirements-strip .wb-strip__label {
    color: var(--73-ink-placeholder);
    font-size: 11px;
    font-weight: 500;
    line-height: 1.2;
  }
  #workbench-mobile-bar-extra .my-requirements-strip .wb-strip__value {
    color: var(--73-ink);
    font-size: 15px;
    font-weight: 700;
    line-height: 1.2;
  }
  #workbench-mobile-bar-extra .my-requirements-strip .wb-strip__action {
    position: absolute;
    top: 50%;
    right: 0;
    transform: translateY(-50%);
  }
}
</style>
