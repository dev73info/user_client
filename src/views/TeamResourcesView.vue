<script setup lang="ts">
import { onMounted } from 'vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useRouter } from 'vue-router'

import { apiUrl } from '@/api/http'
import type { McResourcePayload } from '@/api/mcResources'
import TeamResourcesTable from '@/components/dev/TeamResourcesTable.vue'
import DevResourcePublishVersionDialog from '@/components/dev/DevResourcePublishVersionDialog.vue'
import { LIST_PAGE_SIZES } from '@/composables/useClientPagination'
import { useDevResourcePublishVersion } from '@/composables/useDevResourcePublishVersion'
import { useTeamResourceRowActions } from '@/composables/useTeamResourceRowActions'
import { useTeamResources } from '@/composables/useTeamResources'
import {
  resourceCoverUrl,
  RESOURCE_ARCHIVE_LOCKED_MESSAGE,
  RESOURCE_ARCHIVE_LOCKED_TITLE,
} from '@/shared/resourcePresentation'
import { useAuthStore } from '@/stores/auth'

import {
  Plus,
  Refresh,
  Search,
  TAlert,
  TButton,
  TCard,
  TIcon,
  TInput,
  TLoading,
  TOption,
  TPagination,
  TSelect,
} from 'ui_73info'

const auth = useAuthStore()
const router = useRouter()

/**
 * 团队资源列表（工作台菜单页）。
 *
 * 这一页只负责排版与组合：
 * - 数据、筛选、客户端分页与顶栏读数 → `useTeamResources`；
 * - 「更多」菜单的动作（导航 / 申请公开 / 设为私有 / 删除）→ `useTeamResourceRowActions`；
 * - 「发布版本」弹窗 → `useDevResourcePublishVersion` + `DevResourcePublishVersionDialog`（与资源项目页共用）；
 * - 六列表格 → `TeamResourcesTable`。
 */
const {
  isLoading,
  resources,
  filters,
  hasActiveFilters,
  filteredResources,
  publishedCount,
  reviewCount,
  draftCount,
  archiveLockedCount,
  emptyText,
  page,
  pageSize,
  filteredTotal,
  paged,
  loadResources,
} = useTeamResources()

const {
  publishDialogVisible,
  selectedResource,
  publishingResourceId,
  openPublishVersionDialog,
  submitVersion,
} = useDevResourcePublishVersion()

const {
  deletingResourceId,
  settingPrivateResourceId,
  requestingReviewResourceId,
  openResourceHomepage,
  handleResourceCommand,
} = useTeamResourceRowActions({
  resources,
  reload: loadResources,
  openPublish: openPublishVersionDialog,
})

/** 封面取绝对地址：`apiUrl` 是 `@/api/http` 的路径前缀，表格组件不直接依赖 `@/api`。 */
function resolveCoverUrl(resource: McResourcePayload): string {
  return resourceCoverUrl(resource, apiUrl)
}

function goCreate() {
  router.push({
    path: '/workbench/developer/resources/plugins-init',
    query: { ownership: 'team' },
  })
}

onMounted(async () => {
  auth.hydrate()
  await loadResources()
})
</script>

<template>
  <div class="dev-page dev-page--resource-list">
    <WorkbenchBarSlot>
      <TLoading tag="div" class="dev-meta-strip" :loading="isLoading">
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">团队资源</span>
          <span class="dev-meta-strip__value">{{ resources.length }}</span>
        </div>
        <div class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">公开</span>
          <span class="dev-meta-strip__value">{{ publishedCount }}</span>
        </div>
        <div class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">审核中</span>
          <span class="dev-meta-strip__value">{{ reviewCount }}</span>
        </div>
        <div class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">私有</span>
          <span class="dev-meta-strip__value">{{ draftCount }}</span>
        </div>
        <div class="dev-meta-strip__item dev-meta-strip__action">
          <TButton icon-only :loading="isLoading" aria-label="刷新团队资源" @click="loadResources">
            <TIcon>
              <Refresh />
            </TIcon>
          </TButton>
        </div>
      </TLoading>
    </WorkbenchBarSlot>

    <TCard class="dev-surface-card">
      <div class="dev-card-head">
        <div class="dev-card-head__title-block">
          <h3 class="dev-section-title">团队资源项目</h3>
        </div>
        <div class="dev-card-head__actions">
          <button class="dev-btn dev-btn--primary" type="button" @click="goCreate">
            <TIcon>
              <Plus />
            </TIcon>
            <span>新建资源</span>
          </button>
        </div>
      </div>

      <TAlert
        v-if="archiveLockedCount > 0"
        tone="warning"
        variant="soft"
        class="dev-archive-locked-notice"
        data-testid="resource-archive-locked-notice"
        :title="RESOURCE_ARCHIVE_LOCKED_TITLE"
        :description="RESOURCE_ARCHIVE_LOCKED_MESSAGE"
      />

      <div class="dev-toolbar">
        <TSelect
          v-model="filters.visibility"
          clearable
          placeholder="资源状态"
          class="dev-toolbar__field"
          aria-label="按资源状态筛选"
        >
          <TOption label="已公开" value="published" />
          <TOption label="审核中" value="review" />
          <TOption label="私有" value="draft" />
        </TSelect>

        <TInput
          v-model="filters.keyword"
          clearable
          placeholder="搜索资源标题、作者或标签"
          class="dev-toolbar__search"
        >
          <template #prefix>
            <TIcon>
              <Search />
            </TIcon>
          </template>
        </TInput>

        <div class="dev-toolbar__actions">
          <span v-if="hasActiveFilters" class="dev-toolbar__hint">
            筛选出 {{ filteredResources.length }} / {{ resources.length }} 个
          </span>
        </div>
      </div>

      <TeamResourcesTable
        :rows="paged"
        :loading="isLoading"
        :empty-text="emptyText"
        :requesting-review-id="requestingReviewResourceId"
        :setting-private-id="settingPrivateResourceId"
        :deleting-id="deletingResourceId"
        :cover-url="resolveCoverUrl"
        @open="openResourceHomepage"
        @command="handleResourceCommand"
      />

      <div class="dev-pager">
        <div class="dev-pager__count">
          <TSelect v-model="pageSize" aria-label="每页条数" class="dev-pager__size">
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
          :total="filteredTotal"
          :pager-count="5"
          background
          aria-label="团队资源分页"
        />
      </div>

      <DevResourcePublishVersionDialog
        v-model:open="publishDialogVisible"
        :resource-title="selectedResource?.title ?? null"
        :submitting="publishingResourceId === selectedResource?.id"
        @submit="submitVersion"
      />
    </TCard>
  </div>
</template>

<style scoped>
/* R014：锁定资源的整体说明横幅，放在团队资源表格上方；观感取自 TAlert 的 warning 态。 */
.dev-archive-locked-notice {
  margin: 0 0 16px;
}
</style>
