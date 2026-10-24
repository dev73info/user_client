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
import {
  API_RESOURCE_PURCHASE_HINT,
  canPurchaseOnPlatform,
  formatResourcePriceLabel,
  isPointsResource,
} from '@/shared/resourceSale'
import { isApiResourceKind } from '@/shared/resourceApi'
import { useAuthStore } from '@/stores/auth'
import { useResourceFileDownload } from '@/composables/useResourceFileDownload'
import { useResourceLike } from '@/composables/useResourceLike'
import { useResourcePurchase } from '@/composables/useResourcePurchase'
// 富文本管线（Markdown / 清洗 / 代码块高亮 / 表格包裹）在 utils 里，组件只落一次调用；
// 配套的正文排版在全局样式 `styles/resource-rich-text.css`（v-html 产物没有 data-v）。
import { formatHomepageContent } from '@/utils/resourceRichText'
import ResourceCommentSection from '@/components/resource-detail/ResourceCommentSection.vue'
import ResourceDetailContentCard from '@/components/resource-detail/ResourceDetailContentCard.vue'
import ResourceDetailCover from '@/components/resource-detail/ResourceDetailCover.vue'
import ResourceDetailSummaryCard from '@/components/resource-detail/ResourceDetailSummaryCard.vue'
import ResourcePurchaseDialog from '@/components/resource-detail/ResourcePurchaseDialog.vue'
import ResourceVersionList from '@/components/resource-detail/ResourceVersionList.vue'
import { TLoading, TMessage } from 'ui_73info'

/**
 * 资源详情面板：资源列表页（ResourceCatalogView）里就地渲染的详情内容。
 *
 * 独立详情路由页（`/resources/<作者>--<id>`、`/:root/:entry/:slug`）已废弃，
 * 那两个地址改为轻量重定向到本面板的页内形态（见 ResourceDetailRedirectView）；
 * 所以这里不再有 page 形态：宽度跟随列表页内容区、不写 SEO；面板内不再渲染收起入口。
 *
 * 这一层只留「取数与动作编排」：取详情 / 版本、购买会话（`useResourcePurchase`）、
 * 点赞（`useResourceLike`）、下载（`useResourceFileDownload`），以及把它们接到各块视图上。
 * 视图按详情页的分块拆在 `components/resource-detail/`：
 * 封面（`ResourceDetailCover`）、摘要卡与主操作行（`ResourceDetailSummaryCard` +
 * `ResourceDetailCtaRow`）、页面内容（`ResourceDetailContentCard`），
 * 历史版本 / 评论 / 购买弹窗原本就是独立组件。
 */
const props = defineProps<{
  /** 要展示的资源编号（列表页传选中项） */
  resourceId: number
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
 * 购买（下单 / 渠道 / 支付面与轮询 / 积分余额）全在 `useResourcePurchase` 里：
 * 下单串行队列、支付面世代号、切渠道防抖都原样搬了过去，这里只接状态与动作。
 * `refreshDetail` 留在本组件——资源实体由这里持有，付完要重取一次详情（含 `purchased_by_me`）。
 */
const {
  panelOpen: purchasePanelOpen,
  submitting: purchaseSubmitting,
  channel: purchaseChannel,
  error: purchaseError,
  buyerPointsBalance,
  order: purchaseOrder,
  qrDataUrl: purchaseQrDataUrl,
  showPromoHint,
  open: openPurchasePanelUnlocked,
  close: closePurchasePanel,
  selectChannel: selectPurchaseChannel,
  submit: submitPurchase,
} = useResourcePurchase({
  getResourceId: () => resource.value?.id ?? null,
  isPointsListing: () => isPointsListing.value,
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
const priceLabel = computed(() =>
  formatResourcePriceLabel(resource.value?.price_fen ?? 0, resource.value?.price_points ?? 0),
)
const isPointsListing = computed(() => isPointsResource(resource.value?.price_points))
/**
 * BUG-020：接口资源只在开发者自有站点的服务端下单，平台内没有购买入口。
 *
 * 接口资源的价格是「开放接口下单的售价」，不是平台内商品标价——
 * 所以这里不给它开平台内购买入口（后端会以 409 拒掉），只留一条到开发者站点的引导。
 */
const isApiResource = computed(() => isApiResourceKind(resource.value?.resource_kind))
const needsPurchase = computed(() => {
  if (!resource.value) {
    return false
  }
  return canPurchaseOnPlatform({
    priceFen: resource.value.price_fen,
    pricePoints: resource.value.price_points,
    purchasedByMe: Boolean(resource.value.purchased_by_me),
    isOwner: isOwner.value,
    resourceKind: resource.value.resource_kind,
  })
})

/**
 * BUG-020：接口资源没有平台内购买入口——下单只能走开发者站点的开放接口。
 * 打开购买面板的入口在这里再挡一道，避免别的入口（下载 403 引导等）把用户送进一个
 * 必然失败的支付弹窗。面板本身的动作（下单队列 / 支付面 / 轮询）仍在 `useResourcePurchase` 里。
 */
async function openPurchasePanel(): Promise<void> {
  if (isApiResource.value) {
    TMessage.info(API_RESOURCE_PURCHASE_HINT)
    return
  }
  await openPurchasePanelUnlocked()
}

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
  openPurchasePanel,
})

function handlePrimaryCta() {
  if (needsPurchase.value) {
    void openPurchasePanel()
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

  loading.value = true
  loadError.value = ''
  try {
    const token = auth.token?.trim() ? auth.token : null
    const [resourceDetail, resourceVersions] = await Promise.all([
      getPublicMcResource(resourceId, token),
      listPublicMcResourceVersions(resourceId, token),
    ])
    resource.value = resourceDetail
    versions.value = resourceVersions
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
              :needs-purchase="needsPurchase"
              :is-api-resource="isApiResource"
              :purchase-submitting="purchaseSubmitting"
              :like-submitting="likeSubmitting"
              @primary-cta="handlePrimaryCta"
              @toggle-like="toggleResourceLike"
            />
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
      <div v-else-if="loadError" class="resource-detail-page__load-error">
        <strong>资源详情加载失败</strong>
        <span>{{ loadError }}</span>
      </div>
    </TLoading>
  </div>

  <!-- 购买弹窗：Teleport 在子组件内部，下单 / 渠道 / 支付面与轮询由 useResourcePurchase 驱动 -->
  <ResourcePurchaseDialog
    :open="purchasePanelOpen"
    :title="resource?.title ?? ''"
    :price-label="priceLabel"
    :is-points-listing="isPointsListing"
    :balance="buyerPointsBalance"
    :show-promo-hint="showPromoHint"
    :channel="purchaseChannel"
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
