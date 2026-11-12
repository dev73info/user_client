<script setup lang="ts">
import { computed } from 'vue'

import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import ResourceVersionCreateDialog from '@/components/dev/ResourceVersionCreateDialog.vue'
import ResourceVersionDeleteDialog from '@/components/dev/ResourceVersionDeleteDialog.vue'
import ResourceVersionEditDialog from '@/components/dev/ResourceVersionEditDialog.vue'
import ResourceVersionsTable from '@/components/dev/ResourceVersionsTable.vue'
import WorkbenchPager from '@/components/workbench/WorkbenchPager.vue'
import { useResourceVersionDialogs } from '@/composables/useResourceVersionDialogs'
import { useResourceVersionList } from '@/composables/useResourceVersionList'
import { useResourceVersionSaleFlow } from '@/composables/useResourceVersionSaleFlow'
import {
  isResourceSaleLockedByRequirement,
  RESOURCE_ARCHIVE_LOCKED_MESSAGE,
  RESOURCE_ARCHIVE_LOCKED_TITLE,
} from '@/shared/resourcePresentation'

import type { McResourceVersionPayload } from '@/api/mcResources'

import {
  Plus,
  Refresh,
  Search,
  TAlert,
  TButton,
  TIcon,
  TInput,
  TLoading,
} from 'ui_73info'

/**
 * 「版本管理」页：版本列表 + 发布 / 编辑 / 删除三个弹窗。
 *
 * 取数、筛选与分页在 `useResourceVersionList`，三个弹窗的编排在 `useResourceVersionDialogs`；
 * 表格与弹窗都是组件，本页只剩读数条、锁定提示与挂点。
 */
const {
  loading,
  versionsLoading,
  resource,
  versionRows,
  filters,
  hasActiveFilters,
  filteredVersions,
  deletePendingCount,
  archiveLocked,
  page,
  pageSize,
  filteredTotal,
  pagedVersions,
  loadPage,
  reloadVersions,
  versionDownloadUrl,
  versionFileName,
  formatCreatedAt,
  downloadVersion,
} = useResourceVersionList()

/** 未 claim 的交付资源删除版本才需要需求方审核；claim 后资源归需求方本人，直接删除。 */
const requirementReviewId = computed(() =>
  resource.value && isResourceSaleLockedByRequirement(resource.value)
    ? resource.value.requirement_id
    : null,
)

const versionSaleFlow = useResourceVersionSaleFlow({
  resource,
  openCreateVersionDialog: () => openCreateVersionDialog(),
})
const {
  reviewError: versionSaleReviewError,
  reviewing: versionSaleReviewing,
  completeVersionSale,
} = versionSaleFlow

const {
  createVersionDialogVisible,
  publishing,
  openCreateVersionDialog,
  submitVersion,
  editingVersion,
  editVersionDialogVisible,
  savingVersionId,
  openEditVersionDialog,
  submitVersionEdit,
  deleteVersionTarget,
  deleteVersionDialogVisible,
  deletingVersionId,
  openDeleteVersionDialog,
  closeDeleteVersionDialog,
  removeVersion,
} = useResourceVersionDialogs({
  resource,
  versionRows,
  loadPage,
  onVersionCreated: completeVersionSale,
})

function handleVersionAction(command: string, version: McResourceVersionPayload) {
  if (command === 'download') {
    downloadVersion(version)
  } else if (command === 'edit') {
    openEditVersionDialog(version)
  } else if (command === 'delete') {
    openDeleteVersionDialog(version)
  }
}
</script>

<template>
  <main class="page-shell custom-page-shell wb-sheet dev-versions-page">
    <WorkbenchBarSlot>
      <TLoading tag="div" class="wb-strip" :loading="loading">
        <div class="wb-strip__item">
          <span class="wb-strip__label">版本总数</span>
          <span class="wb-strip__value">{{ versionRows.length }}</span>
        </div>
        <div class="wb-strip__divider" aria-hidden="true" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">关联需求</span>
          <span class="wb-strip__value">{{ resource?.requirement_id || '未关联' }}</span>
        </div>
        <div class="wb-strip__divider" aria-hidden="true" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">删除审核中</span>
          <span class="wb-strip__value">{{ deletePendingCount }}</span>
        </div>
        <div class="wb-strip__item wb-strip__action">
          <TButton
            icon-only
            :loading="versionsLoading"
            aria-label="刷新版本列表"
            @click="reloadVersions"
          >
            <TIcon>
              <Refresh />
            </TIcon>
          </TButton>
        </div>
      </TLoading>
    </WorkbenchBarSlot>

    <TAlert
      v-if="archiveLocked"
      tone="warning"
      variant="soft"
      class="dev-archive-locked-notice"
      data-testid="resource-archive-locked-notice"
      :title="RESOURCE_ARCHIVE_LOCKED_TITLE"
      :description="RESOURCE_ARCHIVE_LOCKED_MESSAGE"
    />

    <TLoading tag="section" class="wallet-section" :loading="loading">
      <TAlert
        v-if="versionSaleReviewError"
        tone="danger"
        variant="soft"
        :title="versionSaleReviewError"
      >
        <template #actions>
          <TButton size="sm" :loading="versionSaleReviewing" @click="completeVersionSale">
            重试公开申请
          </TButton>
        </template>
      </TAlert>

      <div class="wb-toolbar">
        <TInput
          v-model="filters.keyword"
          clearable
          placeholder="搜索版本号、备注或文件名"
          class="wb-toolbar__search"
        >
          <template #prefix>
            <TIcon>
              <Search />
            </TIcon>
          </template>
        </TInput>

        <div class="wb-toolbar__actions">
          <span v-if="hasActiveFilters" class="wb-toolbar__hint">
            筛选出 {{ filteredVersions.length }} / {{ versionRows.length }} 条
          </span>
          <TButton
            variant="solid"
            tone="accent"
            :disabled="archiveLocked"
            @click="openCreateVersionDialog"
          >
            <template #prefix>
              <TIcon><Plus /></TIcon>
            </template>
            发布版本
          </TButton>
        </div>
      </div>

      <ResourceVersionsTable
        :rows="pagedVersions"
        :loading="versionsLoading"
        :empty-text="hasActiveFilters ? '没有匹配的版本' : '当前还没有版本记录'"
        :archive-locked="archiveLocked"
        :download-url-of="versionDownloadUrl"
        :file-name-of="versionFileName"
        :format-created-at="formatCreatedAt"
        @action="handleVersionAction"
      />

      <WorkbenchPager
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="filteredTotal"
        unit="条版本"
        pagination-aria-label="版本列表分页"
      />
    </TLoading>

    <ResourceVersionCreateDialog
      v-model:open="createVersionDialogVisible"
      :submitting="publishing"
      :price-placeholder="
        Number(resource?.buyout_price_fen ?? 0) > 0 ? '0 表示不单卖' : '0 = 免费'
      "
      @submit="submitVersion"
    />

    <ResourceVersionEditDialog
      v-model:open="editVersionDialogVisible"
      :version="editingVersion"
      :options="versionRows"
      :submitting="savingVersionId === editingVersion?.id"
      :file-name-of="versionFileName"
      :price-placeholder="
        Number(resource?.buyout_price_fen ?? 0) > 0 ? '0 表示不单卖' : '0 = 免费'
      "
      @submit="submitVersionEdit"
    />

    <ResourceVersionDeleteDialog
      v-model:open="deleteVersionDialogVisible"
      :target="deleteVersionTarget"
      :requirement-id="requirementReviewId"
      :submitting="deletingVersionId != null"
      :file-name-of="versionFileName"
      @close="closeDeleteVersionDialog"
      @confirm="removeVersion"
    />
  </main>
</template>

<style scoped>
/* 版面走统一层（.wb-sheet / .wb-strip / .wb-card-head / .wb-toolbar / .wb-pager），
   表格走 .dev-table；这里只留本页特有的锁定横幅间距。 */
.dev-archive-locked-notice {
  margin: 0 0 16px;
}
</style>
