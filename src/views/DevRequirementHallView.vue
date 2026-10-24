<script setup lang="ts">
/**
 * 开发者需求大厅（`/workbench/developer/requirements/hall`）。
 *
 * 这一页只负责排版与组合：
 * - 列表、排序、关键词防抖 → `useDevRequirementHall`（`/requirement/hall/query` 一次回全量，
 *   排序、关键词与分页都在本地做）；
 * - 入驻协议签署状态、接单与签协议两处跳转 → `useDevOrderGate`；
 * - 金额、摘要、「接单」按钮文案等纯口径 → `@/shared/devRequirementHall`；
 * - 顶栏读数条 → `DevRequirementHallMetaStrip`；签协议提示 → `DevRequirementHallAgreementNotice`；
 * - 五列表格与窄屏卡片流 → `DevRequirementHallList`。
 *
 * 原先这里还挂着整个「关联需求」弹窗（选已有资源 / 初始化新资源 / 标签树 / 二次确认，约 700 行），
 * 但它的开关 `bindDialogVisible` 只有「置 false」、没有任何「置 true」——「接单」按钮早已改成跳详情页。
 * 绑定需求与初始化资源在 `DevRequirementDetailView` 里有一份活着的实现（还多出转载字段）。
 * 这条不可达的链在本次拆分中删掉，页面可见行为不变。
 */
import { onMounted } from 'vue'
import { TCard, TIcon, TInput, TOption, TPagination, TSelect, Search } from 'ui_73info'

import DevRequirementHallAgreementNotice from '@/components/dev/DevRequirementHallAgreementNotice.vue'
import DevRequirementHallList from '@/components/dev/DevRequirementHallList.vue'
import DevRequirementHallMetaStrip from '@/components/dev/DevRequirementHallMetaStrip.vue'
import { LIST_PAGE_SIZES } from '@/composables/useClientPagination'
import { useDevOrderGate } from '@/composables/useDevOrderGate'
import { useDevRequirementHall } from '@/composables/useDevRequirementHall'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const {
  loading,
  rows,
  total,
  page,
  pageSize,
  filters,
  sortOptions,
  emptyText,
  paymentModeCounts,
  loadRequirements,
  applyFilters,
  searchNow,
  handlePageSizeChange,
  syncKeywordFromRoute,
} = useDevRequirementHall()

const {
  developerAgreementSigned,
  bindGate,
  loadGateStatus,
  openRequirement,
  goSignDeveloperAgreement,
} = useDevOrderGate()

onMounted(async () => {
  auth.hydrate()
  syncKeywordFromRoute()
  await Promise.all([loadRequirements(), loadGateStatus()])
})
</script>

<template>
  <div class="dev-page dev-page--requirement-hall">
    <DevRequirementHallMetaStrip
      :total="total"
      :self-managed="paymentModeCounts.selfManaged"
      :guarantee="paymentModeCounts.guarantee"
      :loading="loading"
      @refresh="loadRequirements"
    />

    <!-- 未签协议这条提示与总览页的保证金提示共用统一层的 .dev-notice
         （金色 + 图标徽标 + 文案 + 右侧动作），不再用 Element 的 el-alert。 -->
    <DevRequirementHallAgreementNotice
      v-if="!developerAgreementSigned"
      :feed-empty="!loading && !rows.length"
      @sign="goSignDeveloperAgreement()"
    />

    <TCard class="dev-surface-card dev-requirement-hall__panel">
      <div class="dev-card-head">
        <div class="dev-card-head__title-block">
          <h3 class="dev-section-title">可接需求</h3>
        </div>
      </div>

      <div class="dev-toolbar">
        <TSelect
          v-model="filters.sortBy"
          placeholder="排序字段"
          class="dev-toolbar__field"
          aria-label="按字段排序"
          @change="applyFilters"
        >
          <TOption
            v-for="item in sortOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </TSelect>

        <TInput
          v-model="filters.keyword"
          clearable
          placeholder="搜索需求编号、标题或描述"
          class="dev-toolbar__search"
          @keyup.enter="searchNow"
        >
          <template #prefix>
            <TIcon>
              <Search />
            </TIcon>
          </template>
        </TInput>
      </div>

      <DevRequirementHallList
        :rows="rows"
        :loading="loading"
        :empty-text="emptyText"
        :gate="bindGate"
        @open="openRequirement"
        @sign="goSignDeveloperAgreement()"
      />

      <!-- 表尾走统一层的 .dev-pager（与钱包记录同一形态）。
           `/requirement/hall/query` 一次回全量，翻页在这里只是切本地切片。 -->
      <div class="dev-pager" :class="{ 'dev-pager--single': total <= pageSize }">
        <div class="dev-pager__count">
          <TSelect
            v-model="pageSize"
            aria-label="每页条数"
            class="dev-pager__size"
            @change="handlePageSizeChange"
          >
            <TOption
              v-for="size in LIST_PAGE_SIZES"
              :key="size"
              :label="`${size} 条/页`"
              :value="size"
            />
          </TSelect>
        </div>
        <TPagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="total"
          :pager-count="5"
          background
          aria-label="需求列表分页"
          @current-change="loadRequirements"
        />
      </div>
    </TCard>
  </div>
</template>

<style scoped>
@media (max-width: 640px) {
  /* 外层卡片去掉框与内边距：列表直接铺在页面底色上，每条需求自成一张卡，像 App 的信息流 */
  .dev-requirement-hall__panel.dev-surface-card {
    padding: 0;
    border: 0;
    background: transparent;
    box-shadow: none;
  }

  /* 移动端不要「可接需求」小标题：顶栏读数已经说明了这是哪一页 */
  .dev-requirement-hall__panel .dev-card-head {
    display: none;
  }

  /* 排序、搜索、重置收进同一条白色搜索栏：一个块代替三个零散的胶囊 */
  .dev-requirement-hall__panel .dev-toolbar {
    flex-wrap: nowrap;
    gap: 0;
    margin-bottom: 12px;
    padding: 3px;
    border-radius: 999px;
    background: var(--dev-surface-strong);
    box-shadow: var(--dev-shadow-card-soft);
  }

  .dev-requirement-hall__panel :deep(.dev-toolbar__search),
  .dev-requirement-hall__panel :deep(.dev-toolbar__field) {
    border-color: transparent !important;
    border-radius: 999px;
    background: transparent;
    box-shadow: none !important;
  }

  .dev-requirement-hall__panel :deep(.dev-toolbar__field) {
    flex: 0 0 auto;
    width: auto;
    padding-right: 6px;
  }

  /* 排序与搜索之间一条细竖线 */
  .dev-requirement-hall__panel :deep(.dev-toolbar__search) {
    position: relative;
    flex: 1 1 0;
  }

  .dev-requirement-hall__panel :deep(.dev-toolbar__search)::before {
    position: absolute;
    top: 9px;
    bottom: 9px;
    left: 0;
    width: 1px;
    background: var(--dev-line);
    content: '';
  }

  /* 移动端搜索栏不放「重置」：清空靠搜索框自带的清除按钮 */
  .dev-requirement-hall__panel .dev-toolbar__actions {
    display: none;
  }

  /* 表尾：去掉「每页条数」，只留居中的页码 */
  .dev-requirement-hall__panel .dev-pager__count {
    display: none;
  }

  .dev-requirement-hall__panel .dev-pager {
    justify-content: center;
    margin-top: 14px;
  }

  /* 只有一页时不摆页码 */
  .dev-requirement-hall__panel .dev-pager--single {
    display: none;
  }
}
</style>
