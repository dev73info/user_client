<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import { HttpError, apiUrl } from '@/api/http'
import {
  getPublicMcResource,
  invalidateResourceListCache,
  listPublicMcResourceVersions,
  type PublicMcResourceItem,
  type PublicMcResourceVersionItem,
} from '@/api/resources'
import { resolveVersionPurchaseTarget } from '@/shared/resourceSale'
import { useResourceOwnerFee } from '@/composables/useResourceOwnerFee'
import { useAuthStore } from '@/stores/auth'
import { useResourceFileDownload } from '@/composables/useResourceFileDownload'
import { useResourceLike } from '@/composables/useResourceLike'
import { useResourcePurchase } from '@/composables/useResourcePurchase'
import { useResourcePurchaseGate } from '@/composables/useResourcePurchaseGate'
import { useResourceVersionSaleDetail } from '@/composables/useResourceVersionSaleDetail'
// 富文本管线（Markdown / 清洗 / 代码块高亮 / 表格包裹）在 utils 里，组件只落一次调用；
// 配套的正文排版在全局样式 `styles/resource-rich-text.css`（v-html 产物没有 data-v）。
import { formatHomepageContent } from '@/utils/resourceRichText'
import ResourceCommentSection from '@/components/resource-detail/ResourceCommentSection.vue'
import ResourceDetailContentCard from '@/components/resource-detail/ResourceDetailContentCard.vue'
import ResourceDetailCover from '@/components/resource-detail/ResourceDetailCover.vue'
import ResourceDetailSummaryCard from '@/components/resource-detail/ResourceDetailSummaryCard.vue'
import ResourcePurchaseDialog from '@/components/resource-detail/ResourcePurchaseDialog.vue'
import ResourceVersionList from '@/components/resource-detail/ResourceVersionList.vue'
import { TButton, TLoading } from 'ui_73info'

/**
 * 资源详情面板：资源列表页（ResourceCatalogView）里就地渲染的详情内容。
 *
 * 独立详情路由页（`/resources/<作者>--<id>`、`/:root/:entry/:slug`）已废弃，
 * 那两个地址改为轻量重定向到本面板的页内形态（见 ResourceDetailRedirectView）；
 * 所以这里不再有 page 形态：宽度跟随列表页内容区、不写 SEO；面板内不再渲染收起入口。
 *
 * 这一层只留「取数与动作编排」：取详情 / 版本、购买会话、点赞、下载，以及把它们接到各块视图上。
 */
const props = defineProps<{
  /** 要展示的资源编号（列表页传选中项） */
  resourceId: number
  /** 面包屑里的当前分区名（如「自由工具」）；缺省显示「资源列表」 */
  contextLabel?: string
}>()

/**
 * `close`：由列表页清掉当前选中（`ResourceCatalogView` 的桌面 / 移动两个实例都还挂着 `@close`）。
 * 面板内原来的「收起详情」按钮已按需求删除，出口改由窄屏的返回控件提供
 * （见模板里的 `resource-detail-page__panel-back`）：它与桌面工具条的「返回」走同一个事件、
 * 同一条父级清理逻辑，不新增事件契约。（本组件是「div + Teleport」的多根结构，
 * 父级监听若没有对应声明就会退化成无法继承的额外属性、触发 Vue 的 dev 警告，所以声明必须保留。）
 */
const emit = defineEmits<{
  (e: 'close'): void
}>()

const auth = useAuthStore()

const loading = ref(false)
/** 面板形态下取数失败时的兜底文案（详情页形态失败会退回首页，不用这个） */
const loadError = ref('')
const resource = ref<PublicMcResourceItem | null>(null)
const versions = ref<PublicMcResourceVersionItem[]>([])

/**
 * 购买（下单 / 渠道 / 支付面与轮询）全在 `useResourcePurchase` 里：
 * 下单串行队列、支付面世代号、切渠道防抖都原样搬了过去，这里只接状态与动作。
 * `refreshDetail` 留在本组件——资源实体由这里持有，付完要重取一次详情（含 `purchased_by_me`）。
 */
const {
  panelOpen: purchasePanelOpen,
  submitting: purchaseSubmitting,
  channel: purchaseChannel,
  error: purchaseError,
  order: purchaseOrder,
  qrDataUrl: purchaseQrDataUrl,
  targetVersion: purchaseTargetVersion,
  showPromoHint,
  open: openPurchasePanelUnlocked,
  close: closePurchasePanel,
  selectChannel: selectPurchaseChannel,
  submit: submitPurchase,
} = useResourcePurchase({
  getResourceId: () => resource.value?.id ?? null,
  getPricePoints: () => Number(resource.value?.price_points ?? 0),
  getPromoShareBps: () => Number(resource.value?.promo_share_bps ?? 0),
  refreshDetail: refreshResourceDetail,
})

const latestVersion = computed(() => versions.value[0] ?? null)

const resourceCoverUrl = computed(() =>
  resource.value?.cover_url ? apiUrl(resource.value.cover_url) : '',
)
const pageContentHtml = computed(() => formatHomepageContent(resource.value?.release_note || ''))
const isPublishedResource = computed(() => resource.value?.visibility === 'published')

const isOwner = computed(() => {
  const creator = resource.value?.creator?.trim() ?? ''
  const username = auth.username?.trim() ?? ''
  return Boolean(creator && username && creator === username)
})

/** 卖家本人看详情时的费率提示；访客不请求也不展示。 */
const {
  hint: ownerFeeHint,
  feeError: ownerFeeError,
  load: loadOwnerFee,
} = useResourceOwnerFee({
  isOwner: () => isOwner.value,
  token: () => auth.token,
  pricePoints: () => Number(resource.value?.price_points ?? 0),
  buyoutPriceFen: () => Number(resource.value?.buyout_price_fen ?? 0),
  versionPrices: () => versions.value.map((item) => Number(item.price_fen ?? 0)),
})
/**
 * 按版本售卖：资源级买断价 / 积分价都为 0，但版本列表里存在可单卖的版本。
 * 标价、价格徽标档位、主按钮购买闸与面板金额都收在 composable 里，
 * 口径是「后端下载判定看版本价，不能按 buyout_price_fen == 0 显示成免费」。
 */
const {
  versionSaleTargetVersion,
  priceLabel,
  isPaidPrice,
  needsVersionPurchase,
  purchasePriceLabel,
} = useResourceVersionSaleDetail({
  resource,
  versions,
  isOwner,
  purchaseTargetVersion,
})

/**
 * 购买闸与 BUG-020 的入口拦截收在 composable 里（判定口径与提示文案原样保留）；
 * 面板只接 `isApiResource` / `needsPurchase` 与「打开购买面板」这一个动作。
 */
const { isApiResource, needsPurchase, openPurchasePanel } = useResourcePurchaseGate({
  resource,
  isOwner,
  openPurchasePanelUnlocked,
})

/**
 * 点赞：动作在 `useResourceLike` 里（组件只留按钮），赞态写回本组件的 `resource`。
 * 拆出去之后这里只剩「谁能点、点了改哪」两件事。
 */
const { submitting: likeSubmitting, toggle: toggleResourceLike } = useResourceLike({
  getResourceId: () => resource.value?.id ?? null,
  getLiked: () => Boolean(resource.value?.liked_by_me),
  isPublished: () => isPublishedResource.value,
  applyLikeState: (state) => {
    if (!resource.value) {
      return
    }
    resource.value = {
      ...resource.value,
      liked_by_me: state.liked_by_me,
      like_count: state.like_count,
    }
  },
})

/** 下载 / 未登录引导 / 403 转购买：动作都在 `useResourceFileDownload` 里，这里只接两个入口。 */
const { openResourceFile, downloadVersion } = useResourceFileDownload({
  getResource: () => resource.value,
  getLatestVersion: () => latestVersion.value,
  needsPurchase: () => needsPurchase.value,
  // 版本售卖资源（资源级标价 0）：版本列表的下载按钮也要先开购买面板，不发注定 403 的请求
  needsVersionPurchase: () => needsVersionPurchase.value,
  openPurchasePanel,
  // 0 价版本不单卖，403 后不能原样下单（后端会 409）：改按整包或最低价可购版本买
  resolvePurchaseVersion: (version) =>
    resolveVersionPurchaseTarget(version, {
      buyoutPriceFen: resource.value?.buyout_price_fen ?? 0,
      pricePoints: resource.value?.price_points ?? 0,
      versions: versions.value,
    }),
})

function handlePrimaryCta() {
  if (needsPurchase.value) {
    void openPurchasePanel()
    return
  }
  if (needsVersionPurchase.value) {
    void openPurchasePanel(versionSaleTargetVersion.value)
    return
  }
  void openResourceFile()
}

function getCurrentResourceId(): number | null {
  return Number.isInteger(props.resourceId) && props.resourceId > 0 ? props.resourceId : null
}

async function refreshResourceDetail() {
  if (!resource.value) {
    return
  }
  const token = auth.token?.trim() ? auth.token : null
  resource.value = await getPublicMcResource(resource.value.id, token)
  invalidateResourceListCache()
}

async function refreshResourceLikeState(resourceId: number) {
  try {
    const token = auth.token?.trim() ? auth.token : null
    resource.value = await getPublicMcResource(resourceId, token)
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      auth.logout()
    }
  }
}

async function loadResource() {
  const resourceId = getCurrentResourceId()
  if (!resourceId) {
    // 不接管导航：由列表页决定选中是否合法（URL 里的 `?resource=` 可能是脏数据）
    loadError.value = '没有拿到有效的资源编号。'
    return
  }
  if (loading.value) {
    return
  }

  loading.value = true
  loadError.value = ''
  try {
    const token = auth.token?.trim() ? auth.token : null
    const [resourceDetail, resourceVersions] = await Promise.all([
      getPublicMcResource(resourceId, token),
      listPublicMcResourceVersions(resourceId, token),
    ])
    resource.value = resourceDetail
    // 列表按时间倒序：`latestVersion` 取 `versions[0]`，页面展示也与设计稿一致（新版本在上）
    versions.value = [...resourceVersions].sort((a, b) => b.created_at.localeCompare(a.created_at))
    await loadOwnerFee()
  } catch (error) {
    // 就地报错，不把整个列表页带回首页
    resource.value = null
    versions.value = []
    // 404 同时覆盖「资源不存在」与「私有 / 待审资源无权查看」，按后端原文显示「not found」对访客没意义
    loadError.value =
      error instanceof HttpError && error.status === 404
        ? '资源不存在或无权访问'
        : error instanceof Error
          ? error.message
          : '加载资源主页失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  auth.hydrate()
  void loadResource()
})

watch(
  () => props.resourceId,
  () => {
    void loadResource()
  },
)

watch(
  () => auth.token,
  () => {
    // 评论由 ResourceCommentSection 自己 watch 令牌重拉，这里只管赞态（需要整份资源重取）
    if (resource.value?.id) {
      void refreshResourceLikeState(resource.value.id)
    }
  },
)
</script>

<template>
  <div class="portal-page resource-detail-page resource-detail-page--panel">
    <TLoading tag="section" class="resource-detail-page__panel" :loading="loading">
      <!-- 窄屏（≤900px）详情面板里的唯一退出口：桌面工具条的「返回」只在 ≥900px 渲染，
           面板内原来的「收起详情」已删除，移动端因此需要一个可见的返回控件。
           桌面端（>900px）由下面的媒体查询隐藏，保证不出现第二个返回入口。 -->
      <!-- 桌面（>900px）详情页的返回行：返回按钮 + 面包屑（草稿形态）；窄屏仍用下面的面板内返回 -->
      <div class="resource-detail-page__backbar">
        <button
          class="resource-detail-page__back-btn"
          type="button"
          aria-label="返回资源列表"
          @click="emit('close')"
        >
          <span aria-hidden="true">←</span>
          <span>返回资源列表</span>
        </button>
        <nav class="resource-detail-page__breadcrumb" aria-label="面包屑">
          <span>资源项目</span>
          <span aria-hidden="true">/</span>
          <span>{{ props.contextLabel || '资源列表' }}</span>
          <span aria-hidden="true">/</span>
          <strong>{{ resource?.title || '资源详情' }}</strong>
        </nav>
      </div>

      <button
        class="resource-detail-page__panel-back"
        type="button"
        aria-label="返回资源列表"
        @click="emit('close')"
      >
        <span aria-hidden="true">←</span>
        <span>返回</span>
      </button>
      <template v-if="resource">
        <section class="resource-detail-page__lead">
          <div class="resource-detail-page__left-stack">
            <ResourceDetailCover :cover-url="resourceCoverUrl" :title="resource.title" />
            <ResourceDetailSummaryCard
              :resource="resource"
              :price-label="priceLabel"
              :is-paid-price="isPaidPrice"
              :needs-purchase="needsPurchase"
              :needs-version-purchase="needsVersionPurchase"
              :is-api-resource="isApiResource"
              :purchase-submitting="purchaseSubmitting"
              :like-submitting="likeSubmitting"
              @primary-cta="handlePrimaryCta"
              @toggle-like="toggleResourceLike"
            />
            <p
              v-if="isOwner && ownerFeeHint"
              class="resource-detail-page__owner-fee"
              :class="{ 'is-error': ownerFeeError }"
              data-testid="resource-owner-fee"
            >
              {{ ownerFeeHint }}
            </p>
          </div>

          <ResourceVersionList
            :versions="versions"
            :resource-id="resource.id"
            :resource-file-name="resource.file_name"
            :needs-purchase="needsPurchase"
            @download="downloadVersion"
          />
        </section>

        <section class="resource-detail-page__detail-grid">
          <ResourceDetailContentCard :html="pageContentHtml" />

          <ResourceCommentSection :resource-id="resource.id" :is-published="isPublishedResource" />
        </section>
      </template>
      <div v-else-if="loadError" class="resource-detail-page__load-error" role="alert">
        <strong>资源详情加载失败</strong>
        <span>{{ loadError }}</span>
        <TButton
          class="resource-detail-page__retry"
          variant="outline"
          :disabled="loading"
          aria-label="重新加载资源详情"
          @click="loadResource"
        >
          重新加载
        </TButton>
      </div>
    </TLoading>
  </div>

  <!-- 购买弹窗：Teleport 在子组件内部，下单 / 渠道 / 支付面与轮询由 useResourcePurchase 驱动 -->
  <ResourcePurchaseDialog
    :open="purchasePanelOpen"
    :title="resource?.title ?? ''"
    :price-label="purchasePriceLabel"
    :show-promo-hint="showPromoHint"
    :channel="purchaseChannel"
    :points-mode="Number(resource?.price_points ?? 0) > 0"
    :error="purchaseError"
    :submitting="purchaseSubmitting"
    :order-no="purchaseOrder?.order_no ?? ''"
    :order-status="purchaseOrder?.status ?? ''"
    :qr-data-url="purchaseQrDataUrl"
    @close="closePurchasePanel"
    @select-channel="selectPurchaseChannel"
    @confirm="submitPurchase"
  />
</template>

<style scoped src="./resource-detail/resource-detail-panel.css"></style>

<!-- 三条卡片共用的基础形态：不带 scoped，理由见文件里的注释（子组件自己的覆写要稳压它） -->
<style src="./resource-detail/resource-detail-shared.css"></style>

<style src="./resource-detail/resource-purchase-palette.css"></style>

<!-- Workbench 亮色详情稿（桌面端覆盖层，放在最后压过子组件的 scoped 样式） -->
<style src="./resource-detail/resource-detail-workbench.css"></style>
