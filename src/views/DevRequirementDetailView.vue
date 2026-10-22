<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { TButton, TCard, TLoading } from 'ui_73info'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import RequirementArchiveBanner from '@/components/dev/RequirementArchiveBanner.vue'
import RequirementBindingCard from '@/components/dev/RequirementBindingCard.vue'
import RequirementDetailMetaStrip from '@/components/dev/RequirementDetailMetaStrip.vue'
import RequirementDetailPanel from '@/components/dev/RequirementDetailPanel.vue'
import RequirementResourceInitPanel from '@/components/dev/RequirementResourceInitPanel.vue'
import { useDevRequirementDetailPage } from '@/composables/useDevRequirementDetailPage'

/**
 * 开发者「需求详情 / 接取需求」页（R047 拆分后只剩装配与导航）。
 *
 * - 取数时序：`composables/useDevRequirementDetailPage`（需求单 / 保证金 / 信用 / 协议 / 资源清单）；
 * - 接取闸门与提交：`composables/useDevRequirementBinding` + `useDevResourceInitForm`；
 * - 展示口径：`shared/devRequirementDetail`（状态 / 预算文案、富文本兜底、归档横幅）、
 *   `shared/devRequirementBinding`（资格闸门文案、占位资源字段）；
 * - 区块：`components/dev/Requirement*`，只吃 props / 插槽、只发 emit。
 *
 * 三处整页跳转留在这里：返回需求大厅、去缴纳保证金、去签《开发者入驻协议》——
 * 它们决定的是「这一页之后去哪」，属于路由身份，不塞进区块组件。
 */
const route = useRoute()
const router = useRouter()

const page = useDevRequirementDetailPage()
const { auth, loading, requirement, requirementId, loadPage } = page
const { depositLoading } = page.capacity
const {
  resourcesLoading,
  bindingMode,
  reviewConfirmed,
  finalConfirmed,
  bindForm,
  init,
  availableResourceOptions,
  hasPendingBindable,
  selectedResource,
  blockReason,
  agreementBlocked,
  requiresDeposit,
  canSubmit,
  confirmLabel,
  binding: submitting,
  handleResourceChange,
  handleBindingModeChange,
  handleReviewChange,
  submitBinding,
} = page.binding
const {
  initForm,
  rootTabs,
  entryTabs,
  currentRootKey,
  currentEntryKey,
  currentEntryLabel,
  platformTagGroups,
  selectedTagIdsByGroup,
  isLoadingTags,
  createBlockReason,
  loadTagTree,
  openRoot,
  openEntry,
  setGroupTagIds,
  touch,
} = init

onMounted(async () => {
  auth.hydrate()
  await loadPage()
})

watch(
  () => route.params.requirementId,
  () => {
    void loadPage()
  },
)

function goBack() {
  void router.push({
    name: 'dev-requirement-hall',
    query: requirementId.value ? { keyword: requirementId.value } : {},
  })
}

function goToOrderDeposit() {
  void router.push('/dev/wallet/order-deposit')
}

function goSignDeveloperAgreement() {
  void router.push({
    name: 'contract-sign',
    query: {
      agreement: 'developer',
      redirect_to: route.fullPath,
    },
  })
}
</script>

<template>
  <TLoading tag="div" class="dev-page dev-requirement-detail" :loading="loading">
    <!-- 顶部读数条：与其余页同一条形态（读数在左、页面级操作在右，刷新固定在 __action 槽） -->
    <WorkbenchBarSlot>
      <RequirementDetailMetaStrip
        :requirement="requirement"
        :loading="loading"
        @back="goBack"
        @refresh="loadPage"
      />
    </WorkbenchBarSlot>

    <!-- R014：合同有效期届满进入锁定 / 已清除后的横幅（锁定态仍可下载历史版本、不能发新版 / 编辑 / 删除）。
         配色样式留在本文件的 scoped 块里（这套裸色值按文件登记的基线），父级 scoped 样式对子组件根元素生效。 -->
    <RequirementArchiveBanner v-if="requirement" :requirement="requirement" />

    <div v-if="requirement" class="dev-requirement-detail__layout">
      <section class="dev-requirement-detail__left">
        <TCard class="dev-surface-card dev-requirement-detail__requirement-card">
          <RequirementDetailPanel :requirement="requirement" />
        </TCard>
      </section>

      <aside class="dev-requirement-detail__right">
        <TLoading :loading="resourcesLoading || depositLoading">
          <TCard class="dev-surface-card dev-requirement-detail__binding-card">
            <RequirementBindingCard
              :mode="bindingMode"
              :requirement-title="requirement.title"
              :block-reason="blockReason"
              :agreement-blocked="agreementBlocked"
              :requires-deposit="requiresDeposit"
              :resource-options="availableResourceOptions"
              :has-pending-bindable="hasPendingBindable"
              :selected-resource-title="selectedResource?.title ?? ''"
              :resource-label="confirmLabel"
              :create-block-reason="createBlockReason"
              :binding="submitting"
              :can-submit="canSubmit"
              v-model:resource-id="bindForm.resourceId"
              v-model:review-confirmed="reviewConfirmed"
              v-model:final-confirmed="finalConfirmed"
              @update:mode="handleBindingModeChange"
              @resource-change="handleResourceChange"
              @review-change="handleReviewChange"
              @sign-agreement="goSignDeveloperAgreement"
              @go-deposit="goToOrderDeposit"
              @cancel="goBack"
              @submit="submitBinding"
            >
              <template #init>
                <RequirementResourceInitPanel
                  v-model:title="initForm.title"
                  v-model:author="initForm.author"
                  v-model:origin-type="initForm.originType"
                  v-model:origin-author="initForm.originAuthor"
                  v-model:origin-url="initForm.originUrl"
                  v-model:origin-org="initForm.originOrg"
                  v-model:origin-note="initForm.originNote"
                  :roots="rootTabs"
                  :entries="entryTabs"
                  :root-key="currentRootKey"
                  :entry-key="currentEntryKey"
                  :entry-label="currentEntryLabel"
                  :groups="platformTagGroups"
                  :selected-tag-ids-by-group="selectedTagIdsByGroup"
                  :is-loading-tags="isLoadingTags"
                  @change="touch"
                  @select-root="openRoot"
                  @select-entry="openEntry"
                  @refresh-tags="loadTagTree"
                  @group-tags="setGroupTagIds"
                />
              </template>
            </RequirementBindingCard>
          </TCard>
        </TLoading>
      </aside>
    </div>

    <TCard v-else-if="!loading" class="dev-surface-card dev-requirement-detail__empty">
      <p class="dev-empty-state">当前需求不存在或已不可接取。</p>
      <TButton variant="outline" @click="goBack">返回需求大厅</TButton>
    </TCard>
  </TLoading>
</template>

<style scoped>
.dev-requirement-detail {
  container-type: inline-size;
  display: grid;
  gap: 16px;
  width: 100%;
  min-width: 0;
}

/* 本页原来自带一条只放两个灰字的 __toolbar、一颗青色 999px 胶囊返回按钮，
   以及 __binding-head / __head / __block-note 这一套自家结构；现在统一走
   .dev-meta-strip / .dev-card-head / .dev-chip / .dev-notice / .dev-btn，
   相关规则随之删除，这里只保留本页特有的排版。 */

.dev-requirement-detail__layout {
  --requirement-detail-panel-height: clamp(500px, calc(100dvh - 190px), 780px);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  align-items: stretch;
  min-width: 0;
}

.dev-requirement-detail__left,
.dev-requirement-detail__right {
  display: grid;
  min-width: 0;
  min-height: 0;
}

.dev-requirement-detail__requirement-card,
.dev-requirement-detail__binding-card {
  position: sticky;
  top: 14px;
  height: var(--requirement-detail-panel-height);
  min-width: 0;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}

.dev-requirement-detail__binding-card {
  container-type: inline-size;
}

@container (max-width: 960px) {
  .dev-requirement-detail__layout {
    grid-template-columns: 1fr;
  }

  .dev-requirement-detail__requirement-card,
  .dev-requirement-detail__binding-card {
    position: static;
    height: auto;
    max-height: none;
    overflow: visible;
  }
}

@media (max-width: 900px) {
  .dev-requirement-detail__layout {
    grid-template-columns: 1fr;
  }

  .dev-requirement-detail__requirement-card,
  .dev-requirement-detail__binding-card {
    position: static;
    height: auto;
    max-height: none;
    overflow: visible;
  }
}

/* R014：合同有效期届满进入锁定 / 已清除的横幅。锁定用琥珀（限时保留），清除用中性灰（终态）。 */
.dev-archive-banner {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #fde68a;
  background: #fffbeb;
  color: #92400e;
  line-height: 1.7;
}

.dev-archive-banner--cleared {
  border-color: #cbd5e1;
  background: #f8fafc;
  color: #475569;
}

.dev-archive-banner strong {
  display: block;
  font-size: 13px;
  font-weight: 800;
}

.dev-archive-banner p {
  margin: 4px 0 0;
  font-size: 12.5px;
}
</style>
