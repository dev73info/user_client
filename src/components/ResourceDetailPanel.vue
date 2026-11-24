<script setup lang="ts">
import { computed } from 'vue'

import { apiUrl } from '@/api/http'
import { resolveVersionPurchaseTarget } from '@/shared/resourceSale'
import { useResourceDetailData } from '@/composables/useResourceDetailData'
import { useResourceFileDownload } from '@/composables/useResourceFileDownload'
import { useResourceLike } from '@/composables/useResourceLike'
import { useResourcePayDeepLink } from '@/composables/useResourcePayDeepLink'
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
 * 这一层只留「动作编排与视图接线」：取数在 `useResourceDetailData`，购买会话、点赞、下载
 * 各自在对应 composable 里，这里负责把它们接到各块视图上（以及支付深链的落点判定）。
 */
const props = defineProps<{
  /** 要展示的资源编号（列表页传选中项） */
  resourceId: number
  /** 面包屑里的当前分区名（如「自由工具」）；缺省显示「资源列表」 */
  contextLabel?: string
  embedded?: boolean // 页内预览嵌入宿主：隐藏返回行，并去掉外壳的内边距与描边
}>()

/** `close`：列表页清掉当前选中（桌面 / 移动两个实例都挂着 `@close`），窄屏返回控件与
 * 桌面工具条「返回」共用它。本组件是「div + Teleport」多根结构，未声明的父级监听会
 * 退化成额外属性并触发 dev 警告，所以这个事件声明必须保留。 */
const emit = defineEmits<{
  (e: 'close'): void
}>()

/**
 * 详情 / 版本 / 卖家费率：取数、失败文案、重试与登录后的赞态重取都在这个 composable 里
 * （从本组件原样搬出，行为不变；面板只留动作编排与视图接线）。
 */
const {
  loading,
  loadError,
  resource,
  versions,
  isOwner,
  ownerFeeHint,
  ownerFeeError,
  loadResource,
  refreshResourceDetail,
} = useResourceDetailData({ getResourceId: () => props.resourceId })

/**
 * 购买（下单 / 渠道 / 支付面与轮询）全在 `useResourcePurchase` 里：
 * 下单串行队列、支付面世代号、切渠道防抖都原样搬了过去，这里只接状态与动作。
 * `refreshDetail` 由取数层（`useResourceDetailData`）提供，付完重取一次详情（含 `purchased_by_me`）。
 */
const {
  panelOpen: purchasePanelOpen,
  submitting: purchaseSubmitting,
  channel: purchaseChannel,
  error: purchaseError,
  order: purchaseOrder,
  qrDataUrl: purchaseQrDataUrl,
  countdownText: purchaseCountdownText,
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
 * 支付深链 `?pay=wechat|alipay`：已登录且这条资源确实要买时自动拉起购买弹窗并选中渠道。
 * 地址上只认渠道、不认任何身份；免费 / 已购 / 作者本人 / 接口资源 / 积分资源只摘参数不弹窗。
 */
useResourcePayDeepLink({
  resolveTarget: () => {
    if (!resource.value) return undefined
    if (Number(resource.value.price_points ?? 0) > 0) return null
    if (needsPurchase.value) return { version: null }
    return needsVersionPurchase.value ? { version: versionSaleTargetVersion.value } : null
  },
  openPurchasePanel,
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
</script>

<template>
  <div
    class="portal-page resource-detail-page resource-detail-page--panel"
    :class="{ 'resource-detail-page--panel-embedded': props.embedded }"
  >
    <TLoading tag="section" class="resource-detail-page__panel" :loading="loading">
      <!-- 窄屏（≤900px）详情面板里的唯一退出口：桌面工具条的「返回」只在 ≥900px 渲染，
           面板内原来的「收起详情」已删除，移动端因此需要一个可见的返回控件。
           桌面端（>900px）由下面的媒体查询隐藏，保证不出现第二个返回入口。 -->
      <!-- 桌面（>900px）详情页的返回行：返回按钮 + 面包屑（草稿形态）；窄屏仍用下面的面板内返回 -->
      <div v-if="!props.embedded" class="resource-detail-page__backbar">
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
    :countdown-text="purchaseCountdownText"
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
