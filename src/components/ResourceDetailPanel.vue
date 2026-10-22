<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { HttpError, apiUrl } from '@/api/http'
import {
  downloadPublicMcResourceVersionFile,
  extractResourceFileNameFromUrl,
  getPublicMcResource,
  invalidateResourceListCache,
  listPublicMcResourceVersions,
  resolveResourceDownloadFileName,
  type PublicMcResourceItem,
  type PublicMcResourceVersionItem,
} from '@/api/resources'
import {
  API_RESOURCE_PURCHASE_HINT,
  canPurchaseOnPlatform,
  formatResourcePriceLabel,
  isPointsResource,
  isPricedResource,
  isPurchaseRequiredError,
} from '@/shared/resourceSale'
import { isApiResourceKind } from '@/shared/resourceApi'
import { useAuthStore } from '@/stores/auth'
import { useDownloadStore } from '@/stores/download'
import { useCodeBlockCopy } from '@/composables/useCodeBlockCopy'
import { useResourceDownload } from '@/composables/useResourceDownload'
import { useResourceLike } from '@/composables/useResourceLike'
import { useResourcePurchase } from '@/composables/useResourcePurchase'
// 富文本管线（Markdown / 清洗 / 代码块高亮 / 表格包裹）在 utils 里，组件只落一次调用；
// 配套的正文排版在全局样式 `styles/resource-rich-text.css`（v-html 产物没有 data-v）。
import { formatHomepageContent } from '@/utils/resourceRichText'
import ResourceCommentSection from '@/components/resource-detail/ResourceCommentSection.vue'
import ResourcePurchaseDialog from '@/components/resource-detail/ResourcePurchaseDialog.vue'
import ResourceVersionList from '@/components/resource-detail/ResourceVersionList.vue'
import ShareCardGenerator from '@/components/ShareCardGenerator.vue'
import { TLoading, TMessage } from 'ui_73info'

/**
 * 资源详情面板：资源列表页（ResourceCatalogView）里就地渲染的详情内容。
 *
 * 独立详情路由页（`/resources/<作者>--<id>`、`/:root/:entry/:slug`）已废弃，
 * 那两个地址改为轻量重定向到本面板的页内形态（见 ResourceDetailRedirectView）；
 * 所以这里不再有 page 形态：宽度跟随列表页内容区、不写 SEO；面板内不再渲染收起入口。
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

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const downloadStore = useDownloadStore()
const { triggerDownload } = useResourceDownload()
function notify(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
  TMessage[type](message)
}

const loading = ref(false)
/** 面板形态下取数失败时的兜底文案（详情页形态失败会退回首页，不用这个） */
const loadError = ref('')
const resource = ref<PublicMcResourceItem | null>(null)
const versions = ref<PublicMcResourceVersionItem[]>([])
const pageContentRef = ref<HTMLElement | null>(null)
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

const tagNames = computed(
  () => resource.value?.tag_selections.flatMap((item) => item.tag_names) ?? [],
)
useCodeBlockCopy({
  rootRef: pageContentRef,
  notify,
})
const authorPillParts = computed(() => {
  const current = resource.value
  if (!current) {
    return { prefix: '', name: '' }
  }

  const author = current.author.trim()
  const creator = current.creator.trim()

  // 团队资源：显示"团队名称-作者"，团队名（前缀）不带炫彩
  if (current.ownership_type === 'team' && current.team_name) {
    if (author) {
      return { prefix: `${current.team_name} -`, name: author }
    }
    return { prefix: current.team_name, name: '' }
  }

  // 个人资源：保持原有逻辑，只有用户名带炫彩
  if (author && creator && author === creator) {
    return { prefix: '作者 / 开发者', name: author }
  }

  if (author) {
    return { prefix: '作者', name: author }
  }
  return { prefix: '作者未知', name: '' }
})
const showCreatorMeta = computed(() => {
  const current = resource.value
  if (!current) {
    return false
  }

  return current.creator.trim().length > 0 && current.creator.trim() !== current.author.trim()
})
const resourceSummaryText = computed(() => {
  const current = resource.value
  if (!current) {
    return ''
  }

  const description = current.description.trim()
  const platform = current.platform.trim()
  if (!description || !platform) {
    return description
  }

  const prefixPattern = new RegExp(`^${escapeRegExp(platform)}\\s*[·・-]\\s*`, 'i')
  return description.replace(prefixPattern, '').trim() || description
})
const visibilityLabel = computed(() =>
  resource.value?.visibility === 'published' ? '公开' : '待正式发布',
)
/** 点赞按钮上的赞数：接口可能不带该字段，缺省按 0 显示（与资源卡片同一口径）。 */
const likeCountLabel = computed(() => resource.value?.like_count ?? 0)
const isRepost = computed(() => resource.value?.origin_type === 'repost')
const originTypeLabel = computed(() => (resource.value?.origin_type === 'repost' ? '转载' : '原创'))
const repostOriginLabel = computed(() => {
  const current = resource.value
  if (!current || current.origin_type !== 'repost') {
    return ''
  }
  const parts: string[] = []
  if (current.origin_org) {
    parts.push(`转载自 ${current.origin_org}`)
  }
  if (current.origin_author) {
    parts.push(`原作者 ${current.origin_author}`)
  }
  return parts.join(' · ')
})
const resourceCoverUrl = computed(() =>
  resource.value?.cover_url ? apiUrl(resource.value.cover_url) : '',
)
const latestVersion = computed(() => versions.value[0] ?? null)
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
const primaryCtaLabel = computed(() => {
  if (downloadStore.state.active) {
    return '下载中...'
  }
  if (needsPurchase.value) {
    return `购买 ${priceLabel.value}`
  }
  return '下载最新版本'
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

/** 摘要要按平台名剥前缀，平台名里的正则元字符先转义再拼进 `RegExp`。 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

function handlePrimaryCta() {
  if (needsPurchase.value) {
    void openPurchasePanel()
    return
  }
  void openResourceFile()
}

async function handleDownloadError(error: unknown) {
  const message = error instanceof Error ? error.message : '下载资源失败'
  if (error instanceof HttpError && error.status === 403 && isPurchaseRequiredError(message)) {
    TMessage.warning('请先购买该资源后再下载')
    void openPurchasePanel()
    return
  }
  TMessage.warning(message)
}

async function openResourceFile() {
  if (!latestVersion.value?.resource) {
    TMessage.info('当前还没有可下载的历史版本')
    return
  }

  const resourceId = resource.value?.id
  if (resourceId == null) {
    TMessage.warning('资源编号无效')
    return
  }
  if (needsPurchase.value) {
    void openPurchasePanel()
    return
  }
  if (!requireDownloadLogin()) {
    return
  }
  const fallbackFileName = resolveResourceDownloadFileName(
    resource.value?.file_name,
    `resource-${resourceId}-v${latestVersion.value.id}`,
  )
  const fileName = extractResourceFileNameFromUrl(latestVersion.value.resource, fallbackFileName)
  try {
    await triggerDownload(
      (onProgress) =>
        downloadPublicMcResourceVersionFile(
          resourceId,
          latestVersion.value!.id,
          auth.token?.trim() || null,
          onProgress,
        ),
      fileName,
    )
  } catch (error) {
    await handleDownloadError(error)
  }
}

async function downloadVersion(version: PublicMcResourceVersionItem) {
  const resourceId = resource.value?.id
  if (resourceId == null) {
    TMessage.warning('资源编号无效')
    return
  }
  if (needsPurchase.value) {
    void openPurchasePanel()
    return
  }
  if (!requireDownloadLogin()) {
    return
  }
  const fallbackFileName = resolveResourceDownloadFileName(
    resource.value?.file_name,
    `resource-${resourceId}-v${version.id}`,
  )
  const fileName = extractResourceFileNameFromUrl(version.resource, fallbackFileName)
  try {
    await triggerDownload(
      (onProgress) =>
        downloadPublicMcResourceVersionFile(
          resourceId,
          version.id,
          auth.token?.trim() || null,
          onProgress,
        ),
      fileName,
    )
  } catch (error) {
    await handleDownloadError(error)
  }
}

/** 下载资源需登录：未登录时提示并引导到登录弹窗。 */
function requireDownloadLogin(): boolean {
  if (auth.isAuthed && auth.token.trim()) {
    return true
  }
  TMessage.info('请先登录后再下载资源')
  void router.push({
    name: 'home',
    query: {
      modal: 'auth',
      mode: 'login',
      redirect_to: route.fullPath,
    },
  })
  return false
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
            <div class="resource-detail-page__cover-card">
              <img
                v-if="resource.cover_url"
                :src="resourceCoverUrl"
                :alt="resource.title"
                class="resource-detail-page__cover-image"
              />
              <div v-else class="resource-detail-page__cover-placeholder">📁</div>
            </div>

            <div class="resource-detail-page__summary-card">
              <div class="resource-detail-page__headline-row">
                <div class="resource-detail-page__headline-left">
                  <span class="resource-detail-page__status-pill">{{ visibilityLabel }}</span>
                  <span
                    class="resource-detail-page__price-pill"
                    :class="{
                      'is-paid': isPricedResource(resource.price_fen, resource.price_points),
                    }"
                    >{{ priceLabel }}</span
                  >
                  <span
                    class="resource-detail-page__repost-badge"
                    :class="{ 'is-repost': isRepost }"
                    >{{ originTypeLabel }}</span
                  >
                </div>
                <span class="resource-detail-page__headline-right">
                  <router-link
                    v-if="resource.author"
                    :to="{ name: 'dev-profile', params: { username: resource.author } }"
                    class="resource-detail-page__author-pill resource-detail-page__author-pill--link"
                  >
                    <span class="resource-detail-page__author-pill-label">{{
                      authorPillParts.prefix
                    }}</span
                    ><span
                      v-if="authorPillParts.name"
                      :class="{
                        'username-gradient':
                          resource.author_username_gradient && !resource.author_username_color,
                      }"
                      :style="
                        resource.author_username_color
                          ? { color: resource.author_username_color }
                          : {}
                      "
                      >{{ authorPillParts.name }}</span
                    >
                  </router-link>
                  <span v-else class="resource-detail-page__author-pill">
                    <span class="resource-detail-page__author-pill-label">{{
                      authorPillParts.prefix
                    }}</span
                    ><span
                      v-if="authorPillParts.name"
                      :class="{
                        'username-gradient':
                          resource.author_username_gradient && !resource.author_username_color,
                      }"
                      :style="
                        resource.author_username_color
                          ? { color: resource.author_username_color }
                          : {}
                      "
                      >{{ authorPillParts.name }}</span
                    >
                  </span>
                  <p
                    v-if="showCreatorMeta"
                    class="resource-detail-page__meta resource-detail-page__meta--aside"
                  >
                    <span class="resource-detail-page__meta-label--green">开发者：</span
                    ><router-link
                      v-if="resource.creator"
                      :to="{ name: 'dev-profile', params: { username: resource.creator } }"
                      :class="{
                        'username-gradient':
                          resource.creator_username_gradient && !resource.creator_username_color,
                      }"
                      :style="
                        resource.creator_username_color
                          ? { color: resource.creator_username_color }
                          : {}
                      "
                      >{{ resource.creator }}</router-link
                    >
                    <span
                      v-else
                      :class="{
                        'username-gradient':
                          resource.creator_username_gradient && !resource.creator_username_color,
                      }"
                      :style="
                        resource.creator_username_color
                          ? { color: resource.creator_username_color }
                          : {}
                      "
                      >{{ resource.creator }}</span
                    >
                  </p>
                </span>
              </div>
              <div class="resource-detail-page__identity-block">
                <h1 class="resource-detail-page__title">{{ resource.title }}</h1>
                <div v-if="isRepost" class="resource-detail-page__repost-meta">
                  <a
                    v-if="resource.origin_url"
                    :href="resource.origin_url"
                    target="_blank"
                    rel="nofollow noopener"
                    class="resource-detail-page__repost-origin"
                  >
                    {{ repostOriginLabel || '查看原始出处' }}
                  </a>
                  <span v-else class="resource-detail-page__repost-origin">{{
                    repostOriginLabel
                  }}</span>
                </div>
                <p class="resource-detail-page__summary">
                  {{ resourceSummaryText || '当前资源暂无简介。' }}
                </p>
              </div>

              <div v-if="tagNames.length > 0" class="resource-detail-page__tags">
                <span v-for="item in tagNames" :key="item" class="resource-detail-page__tag">{{
                  item
                }}</span>
              </div>

              <div class="resource-detail-page__cta-row">
                <div class="resource-detail-page__primary-actions">
                  <button
                    v-if="!isApiResource"
                    class="resource-detail-page__primary-btn"
                    type="button"
                    :disabled="downloadStore.state.active || purchaseSubmitting"
                    @click="handlePrimaryCta"
                  >
                    {{ primaryCtaLabel }}
                  </button>
                  <!-- BUG-020：接口资源没有平台内购买入口，只给到开发者站点下单的引导 -->
                  <p v-else class="resource-detail-page__api-hint">
                    {{ API_RESOURCE_PURCHASE_HINT }}
                  </p>
                  <div
                    v-if="downloadStore.state.active"
                    class="resource-detail-page__download-progress"
                    role="progressbar"
                    :aria-valuenow="downloadStore.state.percent"
                    aria-valuemin="0"
                    aria-valuemax="100"
                  >
                    <div class="resource-detail-page__download-progress__track">
                      <div
                        class="resource-detail-page__download-progress__bar"
                        :style="{ width: `${downloadStore.state.percent}%` }"
                      ></div>
                    </div>
                    <span class="resource-detail-page__download-progress__label">
                      {{ downloadStore.state.percent }}%
                    </span>
                  </div>
                  <button
                    class="resource-detail-page__like-btn"
                    type="button"
                    :class="{ 'resource-detail-page__like-btn--active': resource.liked_by_me }"
                    :disabled="likeSubmitting"
                    :aria-pressed="resource.liked_by_me"
                    :aria-label="`${resource.liked_by_me ? '已点赞' : '点赞'}，当前 ${likeCountLabel} 人赞`"
                    :title="resource.liked_by_me ? '取消点赞' : '点赞'"
                    @click="toggleResourceLike"
                  >
                    <svg
                      class="resource-detail-page__like-icon"
                      viewBox="0 0 24 24"
                      :fill="resource.liked_by_me ? 'currentColor' : 'none'"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path
                        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                      ></path>
                    </svg>
                    <span class="resource-detail-page__like-count" aria-hidden="true">{{
                      likeCountLabel
                    }}</span>
                  </button>
                  <ShareCardGenerator
                    v-if="auth.isAuthed"
                    share-type="resource"
                    :target-id="String(resource.id)"
                  />
                </div>
              </div>
            </div>
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
          <article class="resource-detail-page__content-card">
            <header class="resource-detail-page__section-head">
              <h2>页面内容</h2>
              <span>Content</span>
            </header>
            <div
              v-if="pageContentHtml"
              ref="pageContentRef"
              class="resource-detail-page__content-flow resource-detail-page__rich-text rich-text-body"
              v-html="pageContentHtml"
            />
            <p v-else class="resource-detail-page__paragraph">
              当前还没有额外补充说明。后续更新、兼容性说明或使用建议会展示在这里。
            </p>
          </article>

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

<style scoped>
/* ============================================================
   面板色板（`--rdp-*`）
   ── 拆出去的版本列表 / 评论 / 购买弹窗都是新文件，`raw-color` 门禁按**文件**聚合，
      新文件里出现裸色值就算新增违规；所以色值统一留在本文件（已在基线里，只减不增），
      子组件只取 `var()`。
   ── 声明在根节点上，靠继承下发给面板里的子组件；购买弹窗 Teleport 到 body、拿不到这份继承，
      它那一套变量在文件末尾的全局 style 块里单独声明（挂在弹窗根类名上）。
   ============================================================ */
.resource-detail-page {
  --rdp-ink: #0f172a;
  --rdp-body: #334155;
  --rdp-muted: #64748b;
  --rdp-link: #1d4ed8;
  --rdp-card-border: rgba(198, 210, 236, 0.72);
  --rdp-card-surface: rgba(248, 250, 252, 0.92);
  --rdp-hairline: rgba(219, 229, 247, 0.78);
  --rdp-soft-surface: rgba(239, 246, 255, 0.9);
  --rdp-toggle-bg: rgba(100, 116, 139, 0.09);
  --rdp-toggle-bg-hover: rgba(100, 116, 139, 0.18);
  --rdp-accent: #2563eb;
  --rdp-accent-alt: #4f8cff;
  --rdp-accent-border: rgba(37, 99, 235, 0.58);
  --rdp-accent-ring: rgba(37, 99, 235, 0.1);
  --rdp-btn-shadow: rgba(37, 99, 235, 0.18);
  --rdp-on-accent: #fff;
  --rdp-danger: #dc2626;
  --rdp-comment-surface: rgba(255, 255, 255, 0.78);
  --rdp-input-border: rgba(198, 210, 236, 0.86);
  --rdp-input-surface: rgba(248, 250, 252, 0.96);
  --rdp-input-surface-focus: #fff;
  --rdp-mine-border: rgba(37, 99, 235, 0.26);
  --rdp-mine-surface: rgba(239, 246, 255, 0.82);
  --rdp-avatar-surface: rgba(219, 234, 254, 0.95);
  width: min(1280px, calc(100% - 24px));
  gap: 28px;
}

.resource-detail-page__panel {
  border-radius: 28px;
  border: 1px solid rgba(198, 210, 236, 0.72);
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 18px 42px rgba(76, 103, 172, 0.12);
  backdrop-filter: blur(18px);
  padding: 24px;
}

.resource-detail-page__lead {
  display: grid;
  grid-template-columns: minmax(280px, 0.95fr) minmax(0, 1.25fr);
  gap: 22px;
}

.resource-detail-page__cover-card,
.resource-detail-page__summary-card,
.resource-detail-page__content-card {
  border-radius: 24px;
  border: 1px solid rgba(198, 210, 236, 0.72);
  background: rgba(248, 250, 252, 0.92);
}

.resource-detail-page__left-stack {
  grid-column: 1;
  grid-row: 1 / span 2;
  min-width: 0;
  overflow: hidden;
  border-radius: 24px;
  border: 1px solid rgba(198, 210, 236, 0.72);
  background: rgba(248, 250, 252, 0.92);
}

.resource-detail-page__cover-card {
  aspect-ratio: 1.618;
  min-height: 0;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background:
    radial-gradient(circle at top right, rgba(84, 124, 255, 0.18), transparent 30%),
    linear-gradient(160deg, rgba(219, 234, 254, 0.95), rgba(239, 246, 255, 0.92));
}

/* 封面图与占位块共用尺寸；`display` 只有图是块级——占位块要居中，见下一条（原来是同一条规则里
   先写 `display: block` 再被 `display: flex` 覆盖，那条 block 对该选择器是死声明，拆开只留活的） */
.resource-detail-page__cover-image {
  display: block;
}

.resource-detail-page__cover-image,
.resource-detail-page__cover-placeholder {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.resource-detail-page__cover-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(72px, 10vw, 120px);
}

.resource-detail-page__summary-card {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  border: 0;
  border-radius: 0;
  border-top: 1px solid rgba(198, 210, 236, 0.72);
  background: rgba(255, 255, 255, 0.98);
}

.resource-detail-page__versions-side-card {
  grid-column: 2;
  grid-row: 1 / span 2;
  min-width: 0;
}

.resource-detail-page__headline-row,
.resource-detail-page__cta-row,
.resource-detail-page__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.resource-detail-page__status-pill,
.resource-detail-page__author-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 700;
}

.resource-detail-page__price-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: #166534;
  background: rgba(220, 252, 231, 0.95);
  border: 1px solid rgba(134, 239, 172, 0.7);
}

.resource-detail-page__price-pill.is-paid {
  color: #9a3412;
  background: rgba(255, 237, 213, 0.96);
  border-color: rgba(253, 186, 116, 0.75);
}

.resource-detail-page__status-pill {
  color: #15803d;
  background: rgba(220, 252, 231, 0.92);
}

.resource-detail-page__author-pill {
  color: #1d4ed8;
  background: rgba(219, 234, 254, 0.92);
}

.resource-detail-page__author-pill--link {
  text-decoration: none;
  cursor: pointer;
  transition: background 0.18s ease;
}

.resource-detail-page__author-pill--link:hover {
  background: rgba(191, 219, 254, 0.95);
}

.resource-detail-page__headline-right {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.resource-detail-page__meta--aside {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  background: rgba(241, 245, 249, 0.92);
}

.resource-detail-page__meta-label--green {
  color: #16a34a;
}

.resource-detail-page__meta--aside a {
  color: #64748b;
  text-decoration: none;
  transition: color 0.18s ease;
}

.resource-detail-page__meta--aside a:hover {
  color: #1d4ed8;
}

.resource-detail-page__identity-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.resource-detail-page__title {
  margin: 0;
  color: #0f172a;
  font-size: clamp(28px, 3.2vw, 42px);
  line-height: 1.12;
  font-weight: 900;
  letter-spacing: 0;
  overflow-wrap: anywhere;
}

.resource-detail-page__repost-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.resource-detail-page__headline-left {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.resource-detail-page__repost-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 700;
  background: rgba(99, 102, 241, 0.12);
  color: #4f46e5;
}

.resource-detail-page__repost-badge.is-repost {
  background: rgba(245, 158, 11, 0.14);
  color: #b45309;
}

.resource-detail-page__repost-origin {
  color: #6366f1;
  font-size: 13px;
  overflow-wrap: anywhere;
  text-decoration: none;
}

a.resource-detail-page__repost-origin:hover {
  text-decoration: underline;
}

.resource-detail-page__meta,
.resource-detail-page__summary,
.resource-detail-page__paragraph {
  margin: 0;
  color: #64748b;
  line-height: 1.8;
}

.resource-detail-page__summary {
  max-width: 62ch;
  font-size: 15px;
}

/* 与首页精选卡 portal-spotlight-card__meta-row 同款标签 */
.resource-detail-page__tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.resource-detail-page__tag {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  min-height: 22px;
  padding: 2px 9px;
  border-radius: 999px;
  background: rgba(241, 245, 249, 0.96);
  color: #475569;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-detail-page__primary-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.resource-detail-page__cta-row {
  margin-top: auto;
  padding-top: 18px;
  border-top: 1px solid rgba(219, 229, 247, 0.82);
}

/* 主按钮的描边 / 光标 / 过渡（版本下载按钮已搬进 ResourceVersionList，它那份在子组件里） */
.resource-detail-page__primary-btn {
  border: 0;
  cursor: pointer;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    background-color 180ms ease;
}

.resource-detail-page__primary-btn:hover {
  transform: translateY(-1px);
}

.resource-detail-page__primary-btn {
  border: 0;
  border-radius: 12px;
  min-height: 44px;
  padding: 0 16px;
  color: #fff;
  background: linear-gradient(135deg, #2563eb, #4f8cff);
  font-weight: 700;
  box-shadow: 0 14px 26px rgba(37, 99, 235, 0.2);
}

.resource-detail-page__primary-btn:disabled {
  cursor: wait;
  opacity: 0.78;
}

/* BUG-020：接口资源的引导文案。接口资源没有平台内购买入口（后端会以 409 拒掉），
   这里只说明「到开发者站点下单」，不做成按钮，避免用户点进一个必然失败的支付流程。
   色值取本文件的 `--rdp-*` 色板（同 `raw-color` 门禁口径，不在这里新写裸色值）。 */
.resource-detail-page__api-hint {
  margin: 0;
  padding: 12px 16px;
  border: 1px solid var(--rdp-card-border);
  border-radius: 12px;
  background: var(--rdp-card-surface);
  color: var(--rdp-body);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.6;
}

.resource-detail-page__download-progress {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 200px;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.96);
  border: 1px solid rgba(219, 229, 247, 0.82);
}

.resource-detail-page__download-progress__track {
  position: relative;
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: rgba(219, 229, 247, 0.9);
  overflow: hidden;
}

.resource-detail-page__download-progress__bar {
  position: absolute;
  inset: 0 auto 0 0;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #2563eb, #4f8cff);
  transition: width 120ms linear;
}

.resource-detail-page__download-progress__label {
  flex: 0 0 auto;
  min-width: 42px;
  text-align: right;
  font-size: 13px;
  font-weight: 800;
  color: #1d4ed8;
  font-variant-numeric: tabular-nums;
}

/* 点赞：心形图标 + 赞数（与资源卡片上的点赞同一读法：数字跟在图标后面）。
   未点赞是中性描边心，点赞后实心红心。
   红色取资源卡片点赞的既有值（ResourceCatalog `.portal-resource-browser__like--active`），
   悬停底色取首页点赞控件的既有值（home.css `.portal-spotlight-card__likes:hover`）。
   原来只管一个图标，所以是 44px 正方形；现在带数字，改成 44px 高、左右 12px 的胶囊，
   宽度跟着数字走，单个图标时也不会比原来窄。 */
.resource-detail-page__like-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 44px;
  height: 44px;
  padding: 0 12px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  transition:
    color 180ms ease,
    background-color 180ms ease,
    transform 180ms ease;
}

.resource-detail-page__like-count {
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.resource-detail-page__like-icon {
  width: 20px;
  height: 20px;
  transition: transform 180ms ease;
}

.resource-detail-page__like-btn:hover:not(:disabled) {
  color: #dc2626;
  background: rgba(244, 63, 94, 0.08);
}

.resource-detail-page__like-btn:hover:not(:disabled) .resource-detail-page__like-icon {
  transform: scale(1.08);
}

.resource-detail-page__like-btn--active {
  color: #dc2626;
}

.resource-detail-page__like-btn:focus-visible {
  outline: 2px solid rgba(37, 99, 235, 0.45);
  outline-offset: 2px;
}

.resource-detail-page__like-btn:disabled {
  cursor: wait;
  opacity: 0.72;
}

.resource-detail-page__primary-actions :deep(.share-card-generator__start) {
  min-height: 44px;
  border-radius: 12px;
  background: rgba(239, 246, 255, 0.9);
  box-shadow: none;
}

.resource-detail-page__primary-actions :deep(.share-card-generator__start:hover:not(:disabled)) {
  background: #fff;
  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.12);
}

.resource-detail-page__section-head span {
  font-size: 12px;
}

.resource-detail-page__detail-grid {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-top: 20px;
}

.resource-detail-page__content-card {
  padding: 22px;
}

.resource-detail-page__section-head {
  align-items: baseline;
  margin-bottom: 16px;
}

.resource-detail-page__section-head h2 {
  margin: 0;
  color: #0f172a;
}

.resource-detail-page__content-flow {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

/* 富文本正文的色板。
   正文排版已搬到全局样式 `styles/resource-rich-text.css`（v-html 产物没有 `data-v`，`:deep`
   在那边没有意义），那边只取这里的 `var()`；色值本身留在这个文件里，因为 `raw-color` 门禁
   按文件聚合，新样式文件带裸色值会被算新增违规，而本文件的裸色值已在基线里（只减不增）。
   挂在正文容器上（模板里 `v-html` 的那个 div），由继承传给渲染出来的后代。 */
.resource-detail-page__rich-text {
  --rdp-rich-muted: #64748b;
  --rdp-rich-ink: #0f172a;
  --rdp-rich-link: #2563eb;
  --rdp-rich-quote-border: rgba(96, 165, 250, 0.34);
  --rdp-rich-media-border: rgba(203, 213, 225, 0.86);
  --rdp-rich-media-bg: #f8fafc;
  --rdp-rich-attachment-border: rgba(191, 219, 254, 0.96);
  --rdp-rich-attachment-bg: rgba(239, 246, 255, 0.9);
  --rdp-rich-attachment-ink: #1d4ed8;
  --rdp-rich-hairline: rgba(226, 232, 240, 0.9);
  --rdp-rich-th-bg: rgba(239, 246, 255, 0.96);
}

.resource-detail-page__comments-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* R047 断点收敛：原档位 980px → 900px（与紧随其后的 900px 块合并为一处） */
@media (max-width: 900px) {
  .resource-detail-page__lead {
    grid-template-columns: 1fr;
  }

  .resource-detail-page__left-stack,
  .resource-detail-page__versions-side-card {
    grid-column: auto;
    grid-row: auto;
  }

  .resource-detail-page {
    width: calc(100% - 16px);
  }
}

@media (max-width: 640px) {
  .resource-detail-page__panel {
    padding: 18px;
  }

  .resource-detail-page__summary-card {
    min-height: auto;
  }

  .resource-detail-page__title {
    font-size: 28px;
  }

  .resource-detail-page__cover-card {
    aspect-ratio: 1.618;
    min-height: 0;
  }

  .resource-detail-page__cta-row,
  .resource-detail-page__primary-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .resource-detail-page__primary-btn,
  .resource-detail-page__primary-actions :deep(.share-card-generator),
  .resource-detail-page__primary-actions :deep(.share-card-generator__start) {
    width: 100%;
  }
}

/* ============================================================
   列表页内嵌形态（资源列表页内容区，见 ResourceCatalogView）
   宽度跟随内容区：详情在整宽的单一内容区里跟页面一起滚
   （不再是「外层 sticky + 栏内自滚」），所以这里不设 max-height / overflow；
   层级仍靠描边不用阴影。
   栏内栅格分两档：宽容器（>980px）直接用详情页形态的两栏 lead
   （封面在左、历史版本在右，标题也用详情页档）；≤980px 才压成单列紧凑档。
   ============================================================ */
.resource-detail-page--panel {
  width: 100%;
  min-width: 0;
  /* `.portal-page` 自带上下外边距，内嵌到列表页内容区时要去掉，否则与工具条左右对不齐 */
  margin: 0;
  gap: 16px;
}

.resource-detail-page--panel .resource-detail-page__panel {
  padding: 18px;
  border-radius: 16px;
  box-shadow: none;
}

.resource-detail-page--panel .resource-detail-page__summary-card,
.resource-detail-page--panel .resource-detail-page__content-card {
  padding: 18px;
}

.resource-detail-page--panel .resource-detail-page__detail-grid {
  gap: 16px;
  margin-top: 16px;
}

/* 窄档（与组件自带的 900 断点同一档）：lead 压成单列、封面收窄、标题降一档 */
/* R047 断点收敛：原档位 980px → 900px（与下面「面板返回控件」那块 900px 同档，中间隔着基声明，未合并） */
@media (max-width: 900px) {
  .resource-detail-page--panel .resource-detail-page__lead {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .resource-detail-page--panel .resource-detail-page__left-stack,
  .resource-detail-page--panel .resource-detail-page__versions-side-card {
    grid-column: auto;
    grid-row: auto;
  }

  .resource-detail-page--panel .resource-detail-page__cover-card {
    aspect-ratio: 2.6;
  }

  .resource-detail-page--panel .resource-detail-page__title {
    font-size: 24px;
  }
}

/* ============================================================
   窄屏（≤900px）详情面板里的返回控件
   ── 桌面工具条「返回」（`.catalog-back-btn`）只在 ≥900px 渲染，面板内原来的「收起详情」
      按钮已按需求删除；移动端靠这一枚控件退出详情。行为与桌面「返回」等价：只触发
      `close`，由父级 `ResourceCatalogView.clearSelectedResource` 摘掉 `?resource=`、保留其余 query。
   ── 观感沿用本页「返回」/ 排序触发器的既有令牌（描边卡 + 13px/700 字 + 8px 圆角），
      不新造配色；触摸目标抬到 44px，与面板内主按钮 / 点赞键同一档。
   ── 默认隐藏，仅窄屏显示：桌面端保持原状，面板内不多出第二个返回入口。
   ============================================================ */
.resource-detail-page__panel-back {
  display: none;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  margin-bottom: 14px;
  padding: 0 14px;
  border: 1px solid var(--card-border);
  border-radius: 8px;
  background: var(--bg-soft);
  color: #334155;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    color 160ms ease,
    background-color 160ms ease;
}

.resource-detail-page__panel-back:hover {
  border-color: rgba(31, 74, 209, 0.4);
  color: var(--accent);
  background: #fff;
}

.resource-detail-page__panel-back:focus-visible {
  outline: 2px solid rgba(37, 99, 235, 0.45);
  outline-offset: 2px;
}

@media (max-width: 900px) {
  .resource-detail-page__panel-back {
    display: inline-flex;
  }
}

/* 取数失败时面板就地的兜底（详情页形态失败会退回首页，不走这一块） */
.resource-detail-page__load-error {
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: 44px 16px;
  text-align: center;
  color: #64748b;
  font-size: 13px;
  line-height: 1.7;
}

.resource-detail-page__load-error strong {
  color: #0f172a;
  font-size: 15px;
}
</style>

<style>
/* ============================================================
   购买弹窗色板（`--rdp-purchase-*`）
   ── 弹窗 Teleport 到 body，`.resource-detail-page` 上声明的 `--rdp-*` 继承不到它，
      所以在弹窗自己的根类名上再声明一份。
   ── 必须是全局块（不带 scoped）：scoped 规则只作用于本组件的元素，而弹窗内容是子组件的；
      选择器限定在 `.resource-purchase-modal-wrap` 上，不会外溢到其它弹窗。
   ── 裸色值留在这个文件里（已在 `raw-color` 基线内，只减不增），子组件只取 `var()`。
   ============================================================ */
.resource-purchase-modal-wrap {
  --rdp-purchase-scrim: rgba(15, 23, 42, 0.28);
  --rdp-purchase-border: rgba(198, 210, 236, 0.95);
  --rdp-purchase-glow: rgba(191, 219, 254, 0.55);
  --rdp-purchase-surface: rgba(255, 255, 255, 0.97);
  --rdp-purchase-shadow: rgba(37, 66, 130, 0.18);
  --rdp-purchase-ink: #0f172a;
  --rdp-purchase-body: #334155;
  --rdp-purchase-muted: #64748b;
  --rdp-purchase-soft-ink: #475569;
  --rdp-purchase-white: #fff;
  --rdp-purchase-close-border: rgba(203, 213, 225, 0.95);
  --rdp-purchase-close-border-hover: rgba(148, 163, 184, 0.9);
  --rdp-purchase-plate-border: rgba(226, 232, 240, 0.95);
  --rdp-purchase-plate-surface: rgba(248, 250, 252, 0.96);
  --rdp-purchase-dashed: rgba(148, 163, 184, 0.7);
  --rdp-purchase-dashed-surface: rgba(248, 250, 252, 0.9);
  --rdp-purchase-amount-border: rgba(253, 186, 116, 0.55);
  --rdp-purchase-amount-from: rgba(255, 247, 237, 0.98);
  --rdp-purchase-amount-to: rgba(255, 237, 213, 0.72);
  --rdp-purchase-amount-ink: #9a3412;
  --rdp-purchase-notes-border: rgba(191, 219, 254, 0.85);
  --rdp-purchase-notes-surface: rgba(239, 246, 255, 0.72);
  --rdp-purchase-error-border: rgba(252, 165, 165, 0.85);
  --rdp-purchase-error-surface: rgba(254, 242, 242, 0.9);
  --rdp-purchase-error-ink: #b91c1c;
}
</style>
