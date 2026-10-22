<script setup lang="ts">
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import ResourceVersionCreateDialog from '@/components/dev/ResourceVersionCreateDialog.vue'
import ResourceVersionDeleteDialog from '@/components/dev/ResourceVersionDeleteDialog.vue'
import ResourceVersionEditDialog from '@/components/dev/ResourceVersionEditDialog.vue'
import ResourceVersionsTable from '@/components/dev/ResourceVersionsTable.vue'
import { LIST_PAGE_SIZES } from '@/composables/useClientPagination'
import { useResourceVersionDialogs } from '@/composables/useResourceVersionDialogs'
import { useResourceVersionList } from '@/composables/useResourceVersionList'
import {
  RESOURCE_ARCHIVE_LOCKED_MESSAGE,
  RESOURCE_ARCHIVE_LOCKED_TITLE,
} from '@/shared/resourcePresentation'

import type { McResourceVersionPayload } from '@/api/mcResources'

import {
  Plus,
  Refresh,
  RefreshLeft,
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
  resetFilters,
  loadPage,
  reloadVersions,
  versionDownloadUrl,
  versionFileName,
  formatCreatedAt,
  downloadVersion,
} = useResourceVersionList()

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
  <div class="dev-page dev-page--resource-versions">
    <WorkbenchBarSlot>
      <TLoading tag="div" class="dev-meta-strip" :loading="loading">
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">版本总数</span>
          <span class="dev-meta-strip__value">{{ versionRows.length }}</span>
        </div>
        <div class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">关联需求</span>
          <span class="dev-meta-strip__value">{{ resource?.requirement_id || '未关联' }}</span>
        </div>
        <div class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">删除审核中</span>
          <span class="dev-meta-strip__value">{{ deletePendingCount }}</span>
        </div>
        <div class="dev-meta-strip__item dev-meta-strip__action">
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

    <TLoading tag="section" class="dev-resource-versions__layout" :loading="loading">
      <TCard class="dev-surface-card">
        <div class="dev-card-head">
          <div class="dev-card-head__title-block">
            <h3 class="dev-section-title">版本列表</h3>
          </div>
          <div class="dev-card-head__actions">
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

        <div class="dev-toolbar">
          <TInput
            v-model="filters.keyword"
            clearable
            placeholder="搜索版本号、备注或文件名"
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
              筛选出 {{ filteredVersions.length }} / {{ versionRows.length }} 条
            </span>
            <TButton variant="outline" @click="resetFilters">
              <TIcon>
                <RefreshLeft />
              </TIcon>
              <span>重置</span>
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
            aria-label="版本列表分页"
          />
        </div>
      </TCard>
    </TLoading>

    <ResourceVersionCreateDialog
      v-model:open="createVersionDialogVisible"
      :submitting="publishing"
      @submit="submitVersion"
    />

    <ResourceVersionEditDialog
      v-model:open="editVersionDialogVisible"
      :version="editingVersion"
      :options="versionRows"
      :submitting="savingVersionId === editingVersion?.id"
      :file-name-of="versionFileName"
      @submit="submitVersionEdit"
    />

    <ResourceVersionDeleteDialog
      v-model:open="deleteVersionDialogVisible"
      :target="deleteVersionTarget"
      :requirement-id="resource?.requirement_id ?? null"
      :submitting="deletingVersionId != null"
      :file-name-of="versionFileName"
      @close="closeDeleteVersionDialog"
      @confirm="removeVersion"
    />
  </div>
</template>

<style scoped>
/* 卡片头走 dev-base.css 的 .dev-card-head，表格走 .dev-table（这两处原来是页内自己写的
   .dev-resource-versions__list-head 与无皮肤的 el-table）。这里只留本页特有样式。 */
.dev-resource-versions__layout {
  display: grid;
  gap: 20px;
}

/* R014：锁定资源的说明横幅，放在工作台操作条与版本列表之间（观感取自 TAlert 的 warning 态）。 */
.dev-archive-locked-notice {
  margin: 0 0 16px;
}
</style>
