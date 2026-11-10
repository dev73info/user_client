<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { RefreshLeft, Search, TAlert, TButton, TIcon, TInput, TOption, TSelect } from 'ui_73info'

import { getResourceSaleFee } from '@/api/resourceSale'
import DevResourcePublishVersionDialog from '@/components/dev/DevResourcePublishVersionDialog.vue'
import MyResourceRow from '@/components/resource/MyResourceRow.vue'
import MyResourcesSummaryStrip from '@/components/resource/MyResourcesSummaryStrip.vue'
import WorkbenchPager from '@/components/workbench/WorkbenchPager.vue'
import { useDevResourceList } from '@/composables/useDevResourceList'
import { useDevResourcePublishVersion } from '@/composables/useDevResourcePublishVersion'
import { useDevResourceRowActions } from '@/composables/useDevResourceRowActions'
import { DEV_RESOURCE_VISIBILITY_OPTIONS } from '@/shared/devResourceList'
import {
  isClaimedCustomResource,
  RESOURCE_ARCHIVE_LOCKED_MESSAGE,
  RESOURCE_ARCHIVE_LOCKED_TITLE,
} from '@/shared/resourcePresentation'
import { useAuthStore } from '@/stores/auth'

/**
 * 需求方「我的资源」：本人名下、已转为我的资源的定制交付。
 *
 * 取数 / 筛选 / 分页都复用开发者资源项目那套 composable；本页只把列表换成
 * 卡片行（MyResourceRow），并在统一层的 wb-strip / wb-card-head / wb-toolbar 上排版。
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
  openEditHomepagePage,
  handleResourceCommand,
} = useDevResourceRowActions({
  resources,
  reload: loadResources,
  openPublish: openPublishVersionDialog,
})

/** 清空筛选的入口只在空态里（与统一工具栏口径一致，工具栏不放「重置」）。 */
function clearFilters() {
  filters.keyword = ''
  filters.visibility = ''
}

onMounted(async () => {
  auth.hydrate()
  await Promise.all([loadResources(), loadPlatformFee()])
})

/** 费率只展示用，失败不挡列表；行内「预计到手」会明确写「费率暂不可用」。 */
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
  <main
    class="page-shell custom-page-shell profile-page my-resources-page wb-sheet"
    :aria-busy="isLoading"
  >
    <MyResourcesSummaryStrip
      v-model:visibility="filters.visibility"
      :total="totalCount"
      :published="publishedCount"
      :review="reviewCount"
      :draft="draftCount"
      :loading="isLoading"
      @refresh="loadResources"
    />

    <section class="wallet-section">
      <div class="wb-card-head">
        <div class="wb-card-head__title-block">
          <h3 class="wb-card-head__title">我的资源</h3>
        </div>
      </div>

      <TAlert
        v-if="archiveLockedCount > 0"
        tone="warning"
        variant="soft"
        class="my-resources-page__locked-notice"
        data-testid="resource-archive-locked-notice"
        :title="RESOURCE_ARCHIVE_LOCKED_TITLE"
        :description="RESOURCE_ARCHIVE_LOCKED_MESSAGE"
      />

      <div class="wb-toolbar">
        <TSelect
          v-model="filters.visibility"
          clearable
          placeholder="资源状态"
          class="wb-toolbar__field"
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
          class="wb-toolbar__search"
          aria-label="搜索资源"
        >
          <template #prefix>
            <TIcon>
              <Search />
            </TIcon>
          </template>
        </TInput>

        <div v-if="hasActiveFilters" class="wb-toolbar__actions">
          <span class="wb-toolbar__hint">
            筛选出 {{ filteredResources.length }} / {{ resources.length }} 个
          </span>
        </div>
      </div>

      <div v-if="!filteredTotal" class="wb-empty" role="status">
        <span class="wb-empty__title">{{ emptyText }}</span>
        <div v-if="!isLoading && hasActiveFilters" class="wb-empty__actions">
          <TButton variant="outline" @click="clearFilters">
            <TIcon><RefreshLeft /></TIcon><span>清除筛选</span>
          </TButton>
        </div>
      </div>
      <template v-else>
        <ul class="wb-list" aria-label="我的资源列表">
          <MyResourceRow
            v-for="resource in paged"
            :key="resource.id"
            :resource="resource"
            :version-prices="versionPrices"
            :platform-fee-bps="platformFeeBps"
            :platform-fee-error="platformFeeError"
            :requesting-review-id="requestingReviewResourceId"
            :setting-private-id="settingPrivateResourceId"
            @edit="openEditHomepagePage"
            @command="handleResourceCommand"
          />
        </ul>
        <WorkbenchPager
          v-model:page="page"
          v-model:page-size="pageSize"
          :total="filteredTotal"
          unit="个资源"
          page-size-aria-label="每页资源数"
          pagination-aria-label="资源列表分页"
        />
      </template>
    </section>

    <DevResourcePublishVersionDialog
      v-model:open="publishDialogVisible"
      :resource-title="selectedResource?.title ?? null"
      :submitting="publishingResourceId === selectedResource?.id"
      @submit="submitVersion"
    />
  </main>
</template>

<style scoped>
.my-resources-page__locked-notice {
  margin: 0 0 16px;
}
</style>
