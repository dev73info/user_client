<script setup lang="ts">
/**
 * 开发者资源列表：列表与筛选由 composable 提供，版本与过户使用各自的弹窗。
 */
import { onMounted, ref } from 'vue'

import {
  TAlert,
  TCard,
  TDropdown,
  TDropdownItem,
  TDropdownMenu,
  TIcon,
  TInput,
  TOption,
  TPagination,
  TSelect,
  Plus,
  Search,
} from 'ui_73info'

import { apiUrl } from '@/api/http'
import type { McResourcePayload } from '@/api/mcResources'
import DevResourceListMetaStrip from '@/components/dev/DevResourceListMetaStrip.vue'
import DevResourcePublishVersionDialog from '@/components/dev/DevResourcePublishVersionDialog.vue'
import DevResourceTable from '@/components/dev/DevResourceTable.vue'
import ResourceTransferDialog from '@/components/ResourceTransferDialog.vue'
import { LIST_PAGE_SIZES } from '@/composables/useClientPagination'
import { useDevResourceList } from '@/composables/useDevResourceList'
import { useDevResourcePublishVersion } from '@/composables/useDevResourcePublishVersion'
import {
  useDevResourceRowActions,
  type DevResourceCommandPayload,
} from '@/composables/useDevResourceRowActions'
import { DEV_RESOURCE_VISIBILITY_OPTIONS } from '@/shared/devResourceList'
import {
  resourceCoverUrl,
  RESOURCE_ARCHIVE_LOCKED_MESSAGE,
  RESOURCE_ARCHIVE_LOCKED_TITLE,
} from '@/shared/resourcePresentation'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const transferOpen = ref(false)
const transferResource = ref<McResourcePayload | null>(null)

const {
  isLoading,
  resources,
  filters,
  hasActiveFilters,
  filteredResources,
  page,
  pageSize,
  filteredTotal,
  paged,
  emptyText,
  totalCount,
  publishedCount,
  reviewCount,
  draftCount,
  archiveLockedCount,
  loadResources,
} = useDevResourceList()

const {
  publishDialogVisible,
  selectedResource,
  publishingResourceId,
  openPublishVersionDialog,
  submitVersion,
} = useDevResourcePublishVersion()

const {
  requestingReviewResourceId,
  settingPrivateResourceId,
  deletingResourceId,
  openEditHomepagePage,
  goCreateResource,
  handleResourceCommand,
} = useDevResourceRowActions({
  resources,
  reload: loadResources,
  openPublish: openPublishVersionDialog,
})

/** 封面取绝对地址：`apiUrl` 是 `@/api/http` 的路径前缀，表格组件不直接依赖 `@/api`。 */
function resolveCoverUrl(resource: McResourcePayload): string {
  return resourceCoverUrl(resource, apiUrl)
}

function handleCommand(payload: DevResourceCommandPayload) {
  if (payload.action === 'transfer') {
    transferResource.value = payload.resource
    transferOpen.value = true
    return
  }
  handleResourceCommand(payload)
}

onMounted(async () => {
  auth.hydrate()
  await loadResources()
})
</script>

<template>
  <div class="dev-page dev-page--resource-list">
    <DevResourceListMetaStrip
      :total="totalCount"
      :published="publishedCount"
      :review="reviewCount"
      :draft="draftCount"
      :loading="isLoading"
      @refresh="loadResources"
    />

    <TCard class="dev-surface-card">
      <div class="dev-card-head">
        <div class="dev-card-head__title-block">
          <h3 class="dev-section-title">资源列表</h3>
        </div>
        <div class="dev-card-head__actions">
          <!-- R028：发布入口分两条——普通资源（大厅公开展示）与接口资源（不公开展示，指定来源下单），
               各自进自己的创建页；类别由入口决定，创建页表单里不再有「资源类别」。 -->
          <TDropdown trigger="click" @command="(cmd: unknown) => goCreateResource(cmd)">
            <button type="button" class="dev-btn dev-btn--primary">
              <TIcon>
                <Plus />
              </TIcon>
              <span>发布资源</span>
            </button>
            <template #dropdown>
              <TDropdownMenu>
                <TDropdownItem :command="'normal'">普通资源</TDropdownItem>
                <TDropdownItem :command="'api'">接口资源</TDropdownItem>
              </TDropdownMenu>
            </template>
          </TDropdown>
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
          <TOption
            v-for="option in DEV_RESOURCE_VISIBILITY_OPTIONS"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
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
            筛选出 {{ filteredResources.length }} / {{ totalCount }} 个
          </span>
        </div>
      </div>

      <DevResourceTable
        :rows="paged"
        :loading="isLoading"
        :empty-text="emptyText"
        :requesting-review-id="requestingReviewResourceId"
        :setting-private-id="settingPrivateResourceId"
        :deleting-id="deletingResourceId"
        :cover-url="resolveCoverUrl"
        @edit="openEditHomepagePage"
        @command="handleCommand"
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
          aria-label="资源列表分页"
        />
      </div>
    </TCard>

    <DevResourcePublishVersionDialog
      v-model:open="publishDialogVisible"
      :resource-title="selectedResource?.title ?? null"
      :submitting="publishingResourceId === selectedResource?.id"
      @submit="submitVersion"
    />
    <ResourceTransferDialog
      v-model:open="transferOpen"
      :resource="transferResource"
      @submitted="loadResources"
    />
  </div>
</template>

<style scoped>
/* 资源标题链接的悬停色：全站只有这一处用这支蓝，不往令牌层再加一档。
   挂成页容器上的自定义属性，表格组件（DevResourceTable）读同一份，
   这样新拆出来的文件里没有裸色值。 */
.dev-page--resource-list {
  --dev-resource-link-hover: var(--73-accent);
}

/* R014：锁定资源的整体说明横幅，放在资源列表表格上方；观感取自 TAlert 的 warning 态。 */
.dev-archive-locked-notice {
  margin: 0 0 16px;
}
</style>
