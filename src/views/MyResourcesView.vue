<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { TAlert, TCard, TIcon, TInput, TOption, TPagination, TSelect, Search } from 'ui_73info'

import { apiUrl } from '@/api/http'
import type { McResourcePayload } from '@/api/mcResources'
import { getResourceSaleFee } from '@/api/resourceSale'
import DevResourceListMetaStrip from '@/components/dev/DevResourceListMetaStrip.vue'
import DevResourcePublishVersionDialog from '@/components/dev/DevResourcePublishVersionDialog.vue'
import DevResourceTable from '@/components/dev/DevResourceTable.vue'
import { LIST_PAGE_SIZES } from '@/composables/useClientPagination'
import { useDevResourceList } from '@/composables/useDevResourceList'
import { useDevResourcePublishVersion } from '@/composables/useDevResourcePublishVersion'
import { useDevResourceRowActions } from '@/composables/useDevResourceRowActions'
import { DEV_RESOURCE_VISIBILITY_OPTIONS } from '@/shared/devResourceList'
import { RESOURCE_FEE_NOTICE_TEXT } from '@/shared/requirementFee'
import {
  isClaimedCustomResource,
  resourceCoverUrl,
  RESOURCE_ARCHIVE_LOCKED_MESSAGE,
  RESOURCE_ARCHIVE_LOCKED_TITLE,
} from '@/shared/resourcePresentation'
import { useAuthStore } from '@/stores/auth'

/**
 * 需求方「我的资源」：本人名下、已转为我的资源的定制交付。
 *
 * 列表 / 主页编辑 / 版本管理都复用开发者资源项目那套组件与接口，
 * 只在需求方工作台收窄行操作（没有售出订单、过户与删除）。
 */
const auth = useAuthStore()
const platformFeeBps = ref<number | null>(null)
const platformFeeError = ref(false)

const {
  isLoading,
  resources,
  versionPrices,
  filters,
  hasActiveFilters,
  filteredResources,
  page,
  pageSize,
  filteredTotal,
  paged,
  totalCount,
  publishedCount,
  reviewCount,
  draftCount,
  archiveLockedCount,
  loadResources,
} = useDevResourceList({ keep: isClaimedCustomResource })

/** 空态按需求方口径写，不复用开发者的「当前还没有资源记录」。 */
const emptyText = computed(() => {
  if (isLoading.value) {
    return '资源列表加载中'
  }
  return hasActiveFilters.value ? '没有符合筛选条件的资源' : '还没有已转为我的资源的定制交付'
})

const {
  publishDialogVisible,
  selectedResource,
  publishingResourceId,
  openPublishVersionDialog,
  submitVersion,
} = useDevResourcePublishVersion({ onPublished: loadResources })

const {
  requestingReviewResourceId,
  settingPrivateResourceId,
  deletingResourceId,
  openEditHomepagePage,
  handleResourceCommand,
} = useDevResourceRowActions({
  resources,
  reload: loadResources,
  openPublish: openPublishVersionDialog,
})

/** 需求方可用的行操作：主页 / 申请公开 / 设为私有 / 版本管理。 */
const visibleActions = ['publish', 'request-review', 'set-private', 'versions'] as const

function resolveCoverUrl(resource: McResourcePayload): string {
  return resourceCoverUrl(resource, apiUrl)
}

onMounted(async () => {
  auth.hydrate()
  await Promise.all([loadResources(), loadPlatformFee()])
})

/** 费率只展示用，失败不挡列表；「预计到手」列会明确写「费率暂不可用」。 */
async function loadPlatformFee() {
  try {
    const fee = await getResourceSaleFee(auth.token)
    platformFeeBps.value = fee.platform_fee_bps
    platformFeeError.value = false
  } catch {
    platformFeeBps.value = null
    platformFeeError.value = true
  }
}
</script>

<template>
  <div class="dev-page dev-page--resource-list dev-page--my-resources">
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
          <h3 class="dev-section-title">我的资源</h3>
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
            筛选出 {{ filteredResources.length }} / {{ resources.length }} 个
          </span>
        </div>
      </div>

      <p class="dev-field-hint dev-platform-fee-notice" data-testid="resource-fee-notice">
        {{ RESOURCE_FEE_NOTICE_TEXT }}
      </p>

      <DevResourceTable
        :rows="paged"
        :loading="isLoading"
        :empty-text="emptyText"
        :requesting-review-id="requestingReviewResourceId"
        :setting-private-id="settingPrivateResourceId"
        :deleting-id="deletingResourceId"
        :cover-url="resolveCoverUrl"
        :version-prices="versionPrices"
        :platform-fee-bps="platformFeeBps"
        :platform-fee-error="platformFeeError"
        :visible-actions="visibleActions"
        @edit="openEditHomepagePage"
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
  </div>
</template>

<style scoped>
.dev-page--my-resources {
  --dev-resource-link-hover: var(--73-accent);
}

.dev-archive-locked-notice {
  margin: 0 0 16px;
}
</style>
