<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import { common, createLowlight } from 'lowlight'
import { useRoute, useRouter } from 'vue-router'

import { HttpError, apiUrl } from '@/api/http'
import {
  createPublicMcResourceComment,
  downloadPublicMcResourceVersionFile,
  extractResourceFileNameFromUrl,
  getPublicMcResource,
  invalidateResourceListCache,
  likePublicMcResource,
  listPublicMcResourceComments,
  listPublicMcResourceVersions,
  unlikePublicMcResource,
  resolveResourceDownloadFileName,
  with73Extension,
  type PublicMcResourceCommentItem,
  type PublicMcResourceItem,
  type PublicMcResourceVersionItem,
} from '@/api/resources'
import {
  createResourcePurchase,
  getMyResourcePurchase,
  type ResourcePurchaseOrder,
} from '@/api/resourcePurchase'
import { getAdapayClientPlatform } from '@/api/adapay'
import {
  getWechatPaymentAuthorizationStatus,
  getWechatPaymentAuthorizeUrl,
} from '@/api/auth'
import {
  formatResourcePriceLabel,
  isPointsResource,
  isPricedResource,
  isPurchaseRequiredError,
  needsPurchase as resourceNeedsPurchase,
  type ResourcePayChannelUi,
} from '@/shared/resourceSale'
import { isWechatBrowser } from '@/shared/auth/browser'
import { getMyPoints } from '@/api/points'
import {
  getResourceDetailSlug,
  getTagRouteSlug,
  normalizeTagName,
} from '@/api/resourceTags'
import { useAuthStore } from '@/stores/auth'
import { useDownloadStore } from '@/stores/download'
import { useToast } from '@/composables/useToast'
import { useResourceDownload } from '@/composables/useResourceDownload'
import { useCodeBlockCopy } from '@/composables/useCodeBlockCopy'
import { sanitizeRichHtml } from '@/utils/sanitizeHtml'
import { resetSeoMeta, setSeoMeta } from '@/utils/seo'
import ShareCardGenerator from '@/components/ShareCardGenerator.vue'
import QRCode from 'qrcode'
import { TLoading } from 'ui_73info'

type CommentGate = {
  title: string
  description: string
  actionLabel: string
  action: 'login' | 'realname' | ''
}

const COMMENT_MAX_LENGTH = 300

/**
 * 资源详情面板：一份取数逻辑、两种形态。
 *
 * - `variant = 'page'`：独立详情路由页（`/resources/<作者>--<id>`、`/:root/:entry/:slug`），
 *   整个页面就是这块内容，并由它写 SEO；
 * - `variant = 'panel'`：资源列表页右栏就地面板（主从双栏，见 ResourceCatalogView），
 *   宽度 / 高度跟随栏位、不写 SEO、「继续浏览」换成「收起详情」。
 *
 * 抽成组件的目的是让列表页与独立详情页共用同一份请求与交互，不复制第二套口径。
 */
const props = withDefaults(
  defineProps<{
    /** 要展示的资源编号（列表页传选中项，详情页从路由段解析） */
    resourceId: number
    /** page = 独立详情页；panel = 列表页右栏面板 */
    variant?: 'page' | 'panel'
  }>(),
  { variant: 'page' },
)

const emit = defineEmits<{
  /** 面板形态下点「收起详情」：由列表页清掉当前选中 */
  (e: 'close'): void
}>()

const isPanel = computed(() => props.variant === 'panel')
/** 独立详情页用 `<main>`（页面唯一主内容区）；面板嵌在列表页的 `<main>` 里，只能是 `<div>` */
const rootTag = computed(() => (isPanel.value ? 'div' : 'main'))

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const downloadStore = useDownloadStore()
const { triggerDownload } = useResourceDownload()
const { showToast } = useToast()

const loading = ref(false)
/** 面板形态下取数失败时的兜底文案（详情页形态失败会退回首页，不用这个） */
const loadError = ref('')
const resource = ref<PublicMcResourceItem | null>(null)
const versions = ref<PublicMcResourceVersionItem[]>([])
const expandedVersionIds = ref<number[]>([])
function isVersionNoteExpanded(versionId: number): boolean {
  return expandedVersionIds.value.includes(versionId)
}
function toggleVersionNote(versionId: number) {
  const index = expandedVersionIds.value.indexOf(versionId)
  if (index >= 0) {
    expandedVersionIds.value.splice(index, 1)
  } else {
    expandedVersionIds.value.push(versionId)
  }
}
const comments = ref<PublicMcResourceCommentItem[]>([])
const commentsLoading = ref(false)
const commentSubmitting = ref(false)
const commentText = ref('')
const likeSubmitting = ref(false)
const pageContentRef = ref<HTMLElement | null>(null)
const purchasePanelOpen = ref(false)
const purchaseSubmitting = ref(false)
const purchaseChannel = ref<ResourcePayChannelUi>('alipay')
const purchaseOrder = ref<ResourcePurchaseOrder | null>(null)
const purchaseQrDataUrl = ref('')
/**
 * 购买失败原因：原样透传后端返回的文案（后端 409/500 的响应体会被 requestJson 读成
 * HttpError.message）。toast 只停留 2.6 秒，失败后用户常常看不到原因就重复下单，
 * 所以在弹窗内再持久展示一次。
 */
const purchaseError = ref('')
const buyerPointsBalance = ref<number | null>(null)
let purchasePollTimer: ReturnType<typeof setInterval> | null = null
/** 切换支付渠道防抖，避免连点支付宝/微信刷出一堆订单 */
let channelSwitchTimer: ReturnType<typeof setTimeout> | null = null
/** 下单串行队列：同一时刻只跑一笔，避免并发抢改同一条 pending */
let purchaseSubmitChain: Promise<void> = Promise.resolve()

const tagNames = computed(
  () => resource.value?.tag_selections.flatMap((item) => item.tag_names) ?? [],
)
useCodeBlockCopy({
  rootRef: pageContentRef,
  notify: showToast,
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
const isRepost = computed(() => resource.value?.origin_type === 'repost')
const originTypeLabel = computed(() =>
  resource.value?.origin_type === 'repost' ? '转载' : '原创',
)
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
const currentRootSlug = computed(() => {
  const raw = route.params.rootSlug
  return typeof raw === 'string' ? raw.trim() : ''
})
const currentEntrySlug = computed(() => {
  const raw = route.params.entrySlug
  return typeof raw === 'string' ? raw.trim() : ''
})
const resourceRootName = computed(() => {
  const rootName = resource.value?.tag_selections.find((item) => item.group_path.length > 0)
    ?.group_path[0]
  return normalizeTagName(rootName || '')
})
const resourceRootAlias = computed(() => {
  return (
    resource.value?.tag_selections.find((item) => (item.group_path_aliases?.length ?? 0) > 0)
      ?.group_path_aliases?.[0] ?? ''
  )
})
const resourceEntryAlias = computed(() => {
  return (
    resource.value?.tag_selections.find((item) => (item.group_path_aliases?.length ?? 0) > 1)
      ?.group_path_aliases?.[1] ?? ''
  )
})
const infoCards = computed(() => {
  if (!resource.value) {
    return []
  }

  return [
    {
      label: '当前版本',
      value: latestVersion.value?.version ?? '暂无',
      tone: 'current-version',
    },
    {
      label: '历史版本',
      value: `${versions.value.length}`,
      tone: 'versions',
    },
    {
      label: '最近更新',
      value: formatUpdatedDate(resource.value.updated_at),
      tone: 'updated',
    },
  ]
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
const needsPurchase = computed(() => {
  if (!resource.value) {
    return false
  }
  return resourceNeedsPurchase({
    priceFen: resource.value.price_fen,
    pricePoints: resource.value.price_points,
    purchasedByMe: Boolean(resource.value.purchased_by_me),
    isOwner: isOwner.value,
  })
})
const primaryCtaLabel = computed(() => {
  if (downloadStore.state.active) {
    return '下载中...'
  }
  if (needsPurchase.value) {
    return `购买 ${priceLabel.value}`
  }
  return '下载最新版本'
})
const commentTextLength = computed(() => Array.from(commentText.value.trim()).length)
const commentCountLabel = computed(() =>
  comments.value.length > 0 ? `${comments.value.length} 条评论` : '暂无评论',
)
const canSubmitComment = computed(
  () =>
    auth.isAuthed &&
    isPublishedResource.value &&
    commentText.value.trim().length > 0 &&
    commentTextLength.value <= COMMENT_MAX_LENGTH &&
    !commentSubmitting.value,
)
const commentGate = computed<CommentGate | null>(() => {
  if (resource.value && !isPublishedResource.value) {
    return {
      title: '资源发布后可评论',
      description: '当前资源还未公开发布，评论区会在发布后开放。',
      actionLabel: '',
      action: '',
    }
  }

  if (!auth.isAuthed) {
    return {
      title: '登录后可评论',
      description: '登录并通过实名认证后，可以在这里留下资源使用反馈。',
      actionLabel: '登录',
      action: 'login',
    }
  }

  return null
})

const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})
markdownRenderer.enable(['table'])

const codeHighlighter = createLowlight(common)

type HastNode =
  | { type: 'text'; value: string }
  | { type: 'element'; tagName: string; properties?: { className?: string[] }; children: HastNode[] }
  | { type: 'root'; children: HastNode[] }

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function hastToHtml(node: HastNode): string {
  if (node.type === 'text') {
    return escapeHtmlText(node.value)
  }
  if (node.type === 'root') {
    return node.children.map(hastToHtml).join('')
  }
  const classAttr = node.properties?.className?.length
    ? ` class="${node.properties.className.join(' ')}"`
    : ''
  const children = node.children.map(hastToHtml).join('')
  return `<${node.tagName}${classAttr}>${children}</${node.tagName}>`
}

// 让只读富文本中的代码块与编辑器保持一致：按语言重新高亮并补充 code-block 类。
function highlightRichCodeBlocks(html: string): string {
  if (!html) {
    return html
  }
  const template = document.createElement('template')
  template.innerHTML = html
  template.content.querySelectorAll<HTMLElement>('pre > code').forEach((codeElement) => {
    const preElement = codeElement.parentElement
    if (!preElement) {
      return
    }
    preElement.classList.add('code-block')
    const codeText = codeElement.textContent ?? ''
    if (!codeText.trim()) {
      return
    }
    const languageClass = Array.from(codeElement.classList).find((item) =>
      /^language-[a-z0-9_-]+$/i.test(item),
    )
    const language = languageClass ? languageClass.slice('language-'.length) : undefined
    try {
      const registered =
        language && codeHighlighter.listLanguages().includes(language.toLowerCase())
      const root = registered
        ? codeHighlighter.highlight(language!.toLowerCase(), codeText)
        : codeHighlighter.highlightAuto(codeText)
      const children = (root as { children?: HastNode[] }).children ?? []
      const detectedLanguage = registered
        ? language!.toLowerCase()
        : ((root as { data?: { language?: string } }).data?.language ?? undefined)
      // 未识别出语言时（例如纯中文文本），保留原始内容，仅应用代码块外观，避免内容被清空
      if (children.length === 0 || !detectedLanguage) {
        return
      }
      codeElement.innerHTML = hastToHtml(root as HastNode)
      codeElement.classList.add('hljs')
      codeElement.classList.add(`language-${detectedLanguage}`)
    } catch {
      // 单个代码块高亮失败时保留原始内容
    }
  })
  return template.innerHTML
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 把富文本表格包进可横向滚动的容器，避免移动端列被压得很窄导致文字竖排。
function wrapRichTables(html: string): string {
  if (!html) {
    return html
  }
  const template = document.createElement('template')
  template.innerHTML = html
  template.content.querySelectorAll('table').forEach((table) => {
    const wrap = document.createElement('div')
    wrap.className = 'rich-table-scroll'
    table.parentNode?.insertBefore(wrap, table)
    wrap.appendChild(table)
  })
  return template.innerHTML
}

function formatHomepageContent(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  const rendered = /<\/?[a-z][\s\S]*>/i.test(trimmed)
    ? sanitizeRichHtml(trimmed)
    : sanitizeRichHtml(markdownRenderer.render(trimmed))

  return wrapRichTables(highlightRichCodeBlocks(rendered))
}

function backToPlatform() {
  const fallbackRootSlug = resourceRootAlias.value || getTagRouteSlug(resourceRootName.value)
  const fallbackEntrySlug =
    resourceEntryAlias.value || getTagRouteSlug(resource.value?.platform ?? '')
  const rootSlug = currentRootSlug.value || fallbackRootSlug
  const entrySlug = currentEntrySlug.value || fallbackEntrySlug

  // 资源没有分类标签时（例如从需求行菜单的「资源主页」直达过来），
  // 分类段会是空字符串，push 带分类参数的路由会抛 `Missing required param "rootSlug"`，
  // 这种情况退回免费资源列表，那里本来就不需要分类参数。
  if (!rootSlug || !entrySlug) {
    void router.push({ name: 'resources', query: { sale: 'free' } })
    return
  }

  void router.push({
    name: 'resource-catalog',
    params: { rootSlug, entrySlug },
  })
}

function getCurrentResourceId(): number | null {
  return Number.isInteger(props.resourceId) && props.resourceId > 0 ? props.resourceId : null
}

function formatUpdatedDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '未知日期'
  }

  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function stopPurchasePoll() {
  if (purchasePollTimer !== null) {
    clearInterval(purchasePollTimer)
    purchasePollTimer = null
  }
}

function clearChannelSwitchTimer() {
  if (channelSwitchTimer !== null) {
    clearTimeout(channelSwitchTimer)
    channelSwitchTimer = null
  }
}

/** 当前资源是否已有可复用的待支付码（同渠道），避免弹窗反复开关再插新单 */
function hasReusableCashQr(channel: ResourcePayChannelUi): boolean {
  const order = purchaseOrder.value
  if (!order || !resource.value) {
    return false
  }
  if (order.resource_id !== resource.value.id || order.status !== 'pending') {
    return false
  }
  if (!purchaseQrDataUrl.value.trim()) {
    return false
  }
  const orderChannel = (order.pay_channel ?? '').trim().toLowerCase()
  if (channel === 'alipay') {
    return orderChannel === 'alipay'
  }
  if (channel === 'wechat') {
    return orderChannel === 'wx_pub' || orderChannel === 'wechat'
  }
  return orderChannel === channel
}

async function openPurchasePanel() {
  if (!auth.isAuthed) {
    showToast('请先登录后再购买', 'info')
    void router.push({
      name: 'home',
      query: {
        modal: 'auth',
        mode: 'login',
        redirect_to: route.fullPath,
      },
    })
    return
  }
  clearChannelSwitchTimer()
  purchasePanelOpen.value = true
  purchaseError.value = ''
  buyerPointsBalance.value = null
  if (isPointsListing.value && auth.token?.trim()) {
    purchaseOrder.value = null
    purchaseQrDataUrl.value = ''
    try {
      const me = await getMyPoints(auth.token, { page: 1, page_size: 1 })
      buyerPointsBalance.value = me.points_balance
    } catch {
      buyerPointsBalance.value = null
    }
    return
  }

  // 现金购：优先复用本页已有的待支付码；没有才按默认支付宝拉一次
  if (hasReusableCashQr(purchaseChannel.value)) {
    if (purchaseOrder.value?.order_no) {
      startPurchasePoll(purchaseOrder.value.order_no)
    }
    return
  }
  purchaseChannel.value = 'alipay'
  if (hasReusableCashQr('alipay')) {
    if (purchaseOrder.value?.order_no) {
      startPurchasePoll(purchaseOrder.value.order_no)
    }
    return
  }
  purchaseQrDataUrl.value = ''
  void submitPurchase()
}

function closePurchasePanel() {
  clearChannelSwitchTimer()
  purchasePanelOpen.value = false
  purchaseError.value = ''
  // 保留 pending 订单与二维码；pending 时不停轮询——本机靠查单落 paid 后要能自动刷新详情
}

function selectPurchaseChannel(channel: ResourcePayChannelUi) {
  if (purchaseChannel.value === channel && (purchaseQrDataUrl.value || purchaseSubmitting.value)) {
    return
  }
  purchaseChannel.value = channel
  purchaseError.value = ''
  stopPurchasePoll()
  if (hasReusableCashQr(channel)) {
    if (purchaseOrder.value?.order_no) {
      startPurchasePoll(purchaseOrder.value.order_no)
    }
    return
  }
  purchaseQrDataUrl.value = ''
  clearChannelSwitchTimer()
  // 防抖：连点支付宝/微信只按最后一次真正下单
  channelSwitchTimer = setTimeout(() => {
    channelSwitchTimer = null
    void submitPurchase()
  }, 350)
}

async function refreshResourceDetail() {
  if (!resource.value) {
    return
  }
  const token = auth.token?.trim() ? auth.token : null
  resource.value = await getPublicMcResource(resource.value.id, token)
  invalidateResourceListCache()
}

async function handlePurchasePaid(order: ResourcePurchaseOrder) {
  stopPurchasePoll()
  purchaseOrder.value = order
  purchaseQrDataUrl.value = ''
  purchaseError.value = ''
  showToast('购买成功，可以下载了', 'success')
  await refreshResourceDetail()
  purchasePanelOpen.value = false
}

async function maybeRenderPurchaseQr(order: ResourcePurchaseOrder) {
  const content = order.pay_url?.trim()
  if (!content) {
    purchaseQrDataUrl.value = ''
    return
  }
  try {
    purchaseQrDataUrl.value = await QRCode.toDataURL(content, {
      width: 220,
      margin: 1,
    })
  } catch {
    purchaseQrDataUrl.value = ''
  }
}

async function pollPurchaseOnce(orderNo: string) {
  if (!auth.token?.trim()) {
    return
  }
  try {
    const latest = await getMyResourcePurchase(auth.token, orderNo)
    purchaseOrder.value = latest
    if (latest.status === 'paid') {
      await handlePurchasePaid(latest)
    } else if (latest.status === 'failed' || latest.status === 'closed') {
      stopPurchasePoll()
      showToast('支付未完成，请重新发起购买', 'warning')
    }
  } catch {
    /* 轮询失败不打断扫码流程 */
  }
}

function startPurchasePoll(orderNo: string) {
  stopPurchasePoll()
  // 立刻查一次：后端会对 pending 主动问渠道，不必干等首个 interval
  void pollPurchaseOnce(orderNo)
  purchasePollTimer = setInterval(() => {
    void pollPurchaseOnce(orderNo)
  }, 4000)
}

/**
 * 仅微信内置浏览器需要先做静默授权拿 openid；
 * PC / 普通浏览器：后端回本站中间页 URL 画码，手机扫码后在中间页 OAuth + JSAPI。
 */
async function ensureWechatPayAuthorized(token: string): Promise<boolean> {
  if (!isWechatBrowser()) {
    return true
  }
  const returnedFromOauth = route.query.wechat_oauth === 'success'
  if (returnedFromOauth) {
    return true
  }
  try {
    const { authorized } = await getWechatPaymentAuthorizationStatus(token)
    if (authorized) {
      return true
    }
    const { url } = await getWechatPaymentAuthorizeUrl(token, window.location.href)
    if (!url.trim()) {
      purchaseError.value = '微信授权地址为空，请改用支付宝或稍后重试'
      showToast(purchaseError.value, 'error')
      return false
    }
    showToast('首次微信支付需先完成微信授权，正在跳转…', 'info')
    window.location.assign(url)
    return false
  } catch (error) {
    const message = error instanceof Error ? error.message : '检查微信授权失败'
    purchaseError.value = message
    showToast(message, 'error')
    return false
  }
}

function submitPurchase() {
  purchaseSubmitChain = purchaseSubmitChain
    .catch(() => undefined)
    .then(() => runSubmitPurchase())
  return purchaseSubmitChain
}

async function runSubmitPurchase() {
  if (!resource.value || !auth.token?.trim()) {
    void openPurchasePanel()
    return
  }
  // 排队执行到此时，若渠道已有可复用码则跳过，消化防抖期间的多余请求
  if (!isPointsListing.value && hasReusableCashQr(purchaseChannel.value)) {
    if (purchaseOrder.value?.order_no) {
      startPurchasePoll(purchaseOrder.value.order_no)
    }
    return
  }
  const requestedChannel = purchaseChannel.value
  purchaseSubmitting.value = true
  purchaseError.value = ''
  try {
    if (isPointsListing.value) {
      const order = await createResourcePurchase(auth.token, resource.value.id, {
        pay_channel: 'points',
      })
      purchaseOrder.value = order
      if (order.status === 'paid') {
        await handlePurchasePaid(order)
        return
      }
      showToast('积分购买未完成，请稍后重试', 'warning')
      return
    }
    // 排队间隙用户又切了渠道：以当前选择为准，避免为过期渠道再落单
    if (purchaseChannel.value !== requestedChannel) {
      return
    }
    // 微信内：先静默授权拿 openid，再走 wx_pub JSAPI；
    // PC / 普通浏览器：直接下单，后端回本站中间页 URL 供扫码。
    if (purchaseChannel.value === 'wechat') {
      const ok = await ensureWechatPayAuthorized(auth.token)
      if (!ok) {
        return
      }
    }
    if (purchaseChannel.value !== requestedChannel) {
      return
    }
    const order = await createResourcePurchase(auth.token, resource.value.id, {
      pay_channel: purchaseChannel.value,
      client_platform: getAdapayClientPlatform(),
    })
    if (purchaseChannel.value !== requestedChannel) {
      return
    }
    purchaseOrder.value = order
    if (order.status === 'paid') {
      await handlePurchasePaid(order)
      return
    }
    await maybeRenderPurchaseQr(order)
    if (purchaseChannel.value !== requestedChannel) {
      return
    }
    if (!order.pay_url?.trim()) {
      showToast('订单已创建，支付完成后即可下载', 'info')
    }
    startPurchasePoll(order.order_no)
  } catch (error) {
    if (purchaseChannel.value !== requestedChannel) {
      return
    }
    const message = error instanceof Error ? error.message : '创建购买订单失败'
    if (message.includes('已购买')) {
      showToast(message, 'success')
      await refreshResourceDetail()
      purchasePanelOpen.value = false
      return
    }
    // 后端拒绝的具体原因（例如 409 的响应体）原样留在弹窗里，别让用户只看到一个转瞬即逝的 toast
    purchaseError.value = message
    showToast(message, 'error')
  } finally {
    purchaseSubmitting.value = false
  }
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
    showToast('请先购买该资源后再下载', 'warning')
    void openPurchasePanel()
    return
  }
  showToast(message, 'warning')
}

async function openResourceFile() {
  if (!latestVersion.value?.resource) {
    showToast('当前还没有可下载的历史版本', 'info')
    return
  }

  const resourceId = resource.value?.id
  if (resourceId == null) {
    showToast('资源编号无效', 'warning')
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
    showToast('资源编号无效', 'warning')
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

function formatVersionTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('zh-CN')
}

function getCommenterInitial(value: string): string {
  return Array.from(value.trim())[0]?.toUpperCase() || '用'
}

async function loadComments(resourceId: number) {
  commentsLoading.value = true
  try {
    const token = auth.token?.trim() ? auth.token : null
    comments.value = await listPublicMcResourceComments(resourceId, token)
  } catch (error) {
    comments.value = []
    showToast(error instanceof Error ? error.message : '加载资源评论失败', 'warning')
  } finally {
    commentsLoading.value = false
  }
}

function openCommentLogin() {
  showToast('请先登录后再发表评论', 'info')
  void router.push({
    name: 'home',
    query: {
      modal: 'auth',
      mode: 'login',
      redirect_to: route.fullPath,
    },
  })
}

function openLikeLogin() {
  showToast('请先登录后再点赞', 'info')
  void router.push({
    name: 'home',
    query: {
      modal: 'auth',
      mode: 'login',
      redirect_to: route.fullPath,
    },
  })
}

/** 下载资源需登录：未登录时提示并引导到登录弹窗。 */
function requireDownloadLogin(): boolean {
  if (auth.isAuthed && auth.token.trim()) {
    return true
  }
  showToast('请先登录后再下载资源', 'info')
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

async function toggleResourceLike() {
  if (likeSubmitting.value) {
    return
  }

  const current = resource.value
  if (!current) {
    showToast('资源编号无效', 'warning')
    return
  }

  if (!isPublishedResource.value) {
    showToast('资源公开发布后才可点赞', 'warning')
    return
  }

  if (!auth.isAuthed || !auth.token.trim()) {
    openLikeLogin()
    return
  }

  likeSubmitting.value = true
  try {
    const state = current.liked_by_me
      ? await unlikePublicMcResource(auth.token, current.id)
      : await likePublicMcResource(auth.token, current.id)
    resource.value = {
      ...current,
      liked_by_me: state.liked_by_me,
      like_count: state.like_count,
    }
    invalidateResourceListCache()
    showToast(state.liked_by_me ? '已点赞' : '已取消点赞', 'success')
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      auth.logout()
      openLikeLogin()
    } else {
      showToast(error instanceof Error ? error.message : '点赞操作失败', 'error')
    }
  } finally {
    likeSubmitting.value = false
  }
}

function openRealnamePage() {
  void router.push({ name: 'workbench-realname', query: { redirect_to: route.fullPath } })
}

function handleCommentGateAction() {
  if (!commentGate.value || !commentGate.value.action) {
    return
  }

  if (commentGate.value.action === 'login') {
    openCommentLogin()
    return
  }

  openRealnamePage()
}

async function submitResourceComment() {
  if (commentSubmitting.value) {
    return
  }

  const resourceId = resource.value?.id ?? getCurrentResourceId()
  if (!resourceId) {
    showToast('资源编号无效', 'warning')
    return
  }

  if (!isPublishedResource.value) {
    showToast('资源公开发布后才可评论', 'warning')
    return
  }

  if (!auth.isAuthed || !auth.token.trim()) {
    openCommentLogin()
    return
  }

  const comment = commentText.value.trim()
  const commentLength = Array.from(comment).length
  if (!comment) {
    showToast('请输入评论内容', 'warning')
    return
  }
  if (commentLength > COMMENT_MAX_LENGTH) {
    showToast(`评论不能超过 ${COMMENT_MAX_LENGTH} 字`, 'warning')
    return
  }

  commentSubmitting.value = true
  try {
    const saved = await createPublicMcResourceComment(auth.token, resourceId, { comment })
    comments.value = [
      saved,
      ...comments.value.filter((item) => item.id !== saved.id),
    ]
    commentText.value = ''
    showToast('评论已发布', 'success')
    void loadComments(resourceId)
  } catch (error) {
    if (error instanceof HttpError && error.status === 403) {
      showToast('请先完成实名认证后再发表评论', 'warning')
      openRealnamePage()
    } else {
      showToast(error instanceof Error ? error.message : '评论提交失败', 'error')
    }
  } finally {
    commentSubmitting.value = false
  }
}

async function loadResource() {
  const resourceId = getCurrentResourceId()
  if (!resourceId) {
    // 面板形态下不接管导航：由列表页决定选中是否合法（URL 里的 `?resource=` 可能是脏数据）
    if (isPanel.value) {
      loadError.value = '没有拿到有效的资源编号。'
      return
    }
    showToast('资源编号无效', 'warning')
    router.replace({ name: 'home' })
    return
  }

  loading.value = true
  loadError.value = ''
  comments.value = []
  commentText.value = ''
  try {
    const token = auth.token?.trim() ? auth.token : null
    const [resourceDetail, resourceVersions] = await Promise.all([
      getPublicMcResource(resourceId, token),
      listPublicMcResourceVersions(resourceId, token),
    ])
    resource.value = resourceDetail
    versions.value = resourceVersions
    void loadComments(resourceId)
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载资源主页失败'
    if (isPanel.value) {
      // 右栏就地报错，不把整个列表页带回首页
      resource.value = null
      versions.value = []
      loadError.value = message
    } else {
      showToast(message, 'warning')
      router.replace({ name: 'home' })
    }
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  auth.hydrate()
  void loadResource()
})

onBeforeUnmount(() => {
  stopPurchasePoll()
  // SEO 只有独立详情页在管；面板嵌在列表页里，退出时清掉会把列表页的 SEO 一起抹掉
  if (!isPanel.value) {
    resetSeoMeta()
  }
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
    if (resource.value?.id) {
      void loadComments(resource.value.id)
      void refreshResourceLikeState(resource.value.id)
    }
  },
)

watch(
  resource,
  (current) => {
    if (!current || isPanel.value) {
      // 面板嵌在资源列表页里，SEO 归列表页，选中资源不改页面的标题与描述
      return
    }

    setSeoMeta({
      title: `${current.title} - 73Info 资源`,
      description: current.description || current.release_note || '73Info 平台公开资源详情。',
      path: `/resources/${getResourceDetailSlug(current.id, current.creator || current.author)}`,
    })
  },
)
</script>

<template>
  <component :is="rootTag" class="portal-page resource-detail-page"
    :class="{ 'resource-detail-page--panel': isPanel }">
    <TLoading tag="section" class="resource-detail-page__panel" :loading="loading">
      <template v-if="resource">
        <section class="resource-detail-page__lead">
          <div class="resource-detail-page__left-stack">
            <div class="resource-detail-page__cover-card">
              <img v-if="resource.cover_url" :src="resourceCoverUrl" :alt="resource.title"
                class="resource-detail-page__cover-image" />
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
                  >{{ priceLabel }}</span>
                  <span class="resource-detail-page__repost-badge"
                    :class="{ 'is-repost': isRepost }">{{ originTypeLabel }}</span>
                </div>
                <span class="resource-detail-page__headline-right">
                  <router-link
                    v-if="resource.author"
                    :to="{ name: 'dev-profile', params: { username: resource.author } }"
                    class="resource-detail-page__author-pill resource-detail-page__author-pill--link"
                  >
                    <span class="resource-detail-page__author-pill-label">{{ authorPillParts.prefix }}</span><span v-if="authorPillParts.name" :class="{ 'username-gradient': resource.author_username_gradient && !resource.author_username_color }" :style="resource.author_username_color ? { color: resource.author_username_color } : {}">{{ authorPillParts.name }}</span>
                  </router-link>
                  <span v-else class="resource-detail-page__author-pill">
                    <span class="resource-detail-page__author-pill-label">{{ authorPillParts.prefix }}</span><span v-if="authorPillParts.name" :class="{ 'username-gradient': resource.author_username_gradient && !resource.author_username_color }" :style="resource.author_username_color ? { color: resource.author_username_color } : {}">{{ authorPillParts.name }}</span>
                  </span>
                  <p v-if="showCreatorMeta" class="resource-detail-page__meta resource-detail-page__meta--aside">
                    <span class="resource-detail-page__meta-label--green">开发者：</span><router-link
                      v-if="resource.creator"
                      :to="{ name: 'dev-profile', params: { username: resource.creator } }"
                      :class="{ 'username-gradient': resource.creator_username_gradient && !resource.creator_username_color }"
                      :style="resource.creator_username_color ? { color: resource.creator_username_color } : {}"
                    >{{ resource.creator }}</router-link>
                    <span v-else :class="{ 'username-gradient': resource.creator_username_gradient && !resource.creator_username_color }" :style="resource.creator_username_color ? { color: resource.creator_username_color } : {}">{{ resource.creator }}</span>
                  </p>
                </span>
              </div>
            <div class="resource-detail-page__identity-block">
              <h1 class="resource-detail-page__title">{{ resource.title }}</h1>
              <div v-if="isRepost" class="resource-detail-page__repost-meta">
                <a v-if="resource.origin_url" :href="resource.origin_url" target="_blank"
                  rel="nofollow noopener" class="resource-detail-page__repost-origin">
                  {{ repostOriginLabel || '查看原始出处' }}
                </a>
                <span v-else class="resource-detail-page__repost-origin">{{ repostOriginLabel }}</span>
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
                <button class="resource-detail-page__primary-btn" type="button"
                  :disabled="downloadStore.state.active || purchaseSubmitting" @click="handlePrimaryCta">
                  {{ primaryCtaLabel }}
                </button>
                <div v-if="downloadStore.state.active" class="resource-detail-page__download-progress"
                  role="progressbar" :aria-valuenow="downloadStore.state.percent" aria-valuemin="0"
                  aria-valuemax="100">
                  <div class="resource-detail-page__download-progress__track">
                    <div class="resource-detail-page__download-progress__bar"
                      :style="{ width: `${downloadStore.state.percent}%` }"></div>
                  </div>
                  <span class="resource-detail-page__download-progress__label">
                    {{ downloadStore.state.percent }}%
                  </span>
                </div>
                <button class="resource-detail-page__like-btn" type="button"
                  :class="{ 'resource-detail-page__like-btn--active': resource.liked_by_me }" :disabled="likeSubmitting"
                  :aria-pressed="resource.liked_by_me" @click="toggleResourceLike">
                  <span aria-hidden="true">{{ resource.liked_by_me ? '♥' : '♡' }}</span>
                  <span>{{ resource.liked_by_me ? '已点赞' : '点赞' }}</span>
                  <strong>{{ resource.like_count ?? 0 }}</strong>
                </button>
                <ShareCardGenerator v-if="auth.isAuthed" share-type="resource" :target-id="String(resource.id)" />
              </div>
              <button class="resource-detail-page__secondary-btn" type="button"
                @click="isPanel ? emit('close') : backToPlatform()">
                {{ isPanel ? '收起详情' : '继续浏览' }}
              </button>
            </div>

            </div>
          </div>

          <article class="resource-detail-page__content-card resource-detail-page__versions-side-card">
            <header class="resource-detail-page__section-head">
              <h2>历史版本</h2>
              <span>Versions</span>
            </header>
            <div v-if="versions.length" class="resource-detail-page__version-list">
              <article v-for="version in versions" :key="version.id" class="resource-detail-page__version-card">
                <div class="resource-detail-page__version-headline">
                  <div class="resource-detail-page__version-meta">
                    <strong>{{ version.version }}</strong>
                    <span>{{ formatVersionTime(version.created_at) }}</span>
                  </div>
                </div>
                <button v-if="version.note" class="resource-detail-page__version-note-toggle" type="button"
                  @click="toggleVersionNote(version.id)">
                  {{ isVersionNoteExpanded(version.id) ? '收起' : '展开' }}
                </button>
                <div class="resource-detail-page__version-note-wrap">
                  <p v-if="version.note" class="resource-detail-page__version-note"
                    :class="{ 'is-collapsed': !isVersionNoteExpanded(version.id) }"
                    v-html="formatHomepageContent(version.note)"></p>
                  <p v-else class="resource-detail-page__paragraph">当前版本暂无补充说明。</p>
                </div>
                <div class="resource-detail-page__version-actions">
                  <button class="resource-detail-page__version-download" type="button"
                    :disabled="downloadStore.state.active" @click="downloadVersion(version)">
                    {{
                      needsPurchase
                        ? '购买后下载'
                        : downloadStore.state.active &&
                            downloadStore.state.fileName ===
                              with73Extension(
                                extractResourceFileNameFromUrl(
                                  version.resource,
                                  resolveResourceDownloadFileName(
                                    resource.file_name,
                                    `resource-${resource.id}-v${version.id}`,
                                  ),
                                ),
                              )
                          ? `下载中 ${downloadStore.state.percent}%`
                          : '下载'
                    }}
                  </button>
                </div>
              </article>
            </div>
            <p v-else class="resource-detail-page__paragraph">当前还没有可展示的历史版本。</p>
          </article>
        </section>

        <section class="resource-detail-page__detail-grid">
          <article class="resource-detail-page__content-card">
            <header class="resource-detail-page__section-head">
              <h2>页面内容</h2>
              <span>Content</span>
            </header>
            <div v-if="pageContentHtml" ref="pageContentRef"
              class="resource-detail-page__content-flow resource-detail-page__rich-text rich-text-body"
              v-html="pageContentHtml" />
            <p v-else class="resource-detail-page__paragraph">
              当前还没有额外补充说明。后续更新、兼容性说明或使用建议会展示在这里。
            </p>
          </article>

          <article class="resource-detail-page__content-card resource-detail-page__comments-card">
            <header class="resource-detail-page__section-head">
              <h2>资源评论</h2>
              <span>{{ commentCountLabel }}</span>
            </header>

            <section class="resource-detail-page__comment-composer">
              <div v-if="commentGate" class="resource-detail-page__comment-gate">
                <div>
                  <strong>{{ commentGate.title }}</strong>
                  <p>{{ commentGate.description }}</p>
                </div>
                <button v-if="commentGate.actionLabel" class="resource-detail-page__comment-action" type="button"
                  @click="handleCommentGateAction">
                  {{ commentGate.actionLabel }}
                </button>
              </div>
              <form v-else class="resource-detail-page__comment-form" @submit.prevent="submitResourceComment">
                <textarea v-model="commentText" class="resource-detail-page__comment-input" rows="4" maxlength="300"
                  placeholder="写下你对这个资源的使用体验、兼容性补充或改进建议"></textarea>
                <div class="resource-detail-page__comment-toolbar">
                  <span class="resource-detail-page__comment-count"
                    :class="{ danger: commentTextLength > COMMENT_MAX_LENGTH }">
                    {{ commentTextLength }} / {{ COMMENT_MAX_LENGTH }}
                  </span>
                  <button class="resource-detail-page__comment-submit" type="submit" :disabled="!canSubmitComment">
                    {{ commentSubmitting ? '发布中...' : '发布评论' }}
                  </button>
                </div>
              </form>
            </section>

            <TLoading tag="div" class="resource-detail-page__comment-list" :loading="commentsLoading">
              <article v-for="comment in comments" :key="comment.id" class="resource-detail-page__comment-item"
                :class="{ mine: auth.username && comment.commenter === auth.username }">
                <div class="resource-detail-page__comment-avatar">
                  {{ getCommenterInitial(comment.commenter) }}
                </div>
                <div class="resource-detail-page__comment-body">
                  <div class="resource-detail-page__comment-meta">
                    <strong :class="{ 'username-gradient': comment.commenter_username_gradient && !comment.commenter_username_color }" :style="comment.commenter_username_color ? { color: comment.commenter_username_color } : {}">{{ comment.commenter }}</strong>
                    <span>{{ formatVersionTime(comment.updated_at) }}</span>
                  </div>
                  <p>{{ comment.comment_text }}</p>
                </div>
              </article>
              <p v-if="!commentsLoading && comments.length === 0" class="resource-detail-page__paragraph">
                暂时还没有评论。
              </p>
            </TLoading>
          </article>
        </section>
      </template>
      <div v-else-if="loadError" class="resource-detail-page__load-error">
        <strong>资源详情加载失败</strong>
        <span>{{ loadError }}</span>
      </div>
    </TLoading>
  </component>

  <Teleport to="body">
    <div
      v-if="purchasePanelOpen"
      class="modal-wrap resource-purchase-modal-wrap"
      @click.self="closePurchasePanel"
    >
      <section
        class="pay-modal resource-purchase-modal"
        role="dialog"
        aria-modal="true"
        aria-label="购买确认"
      >
        <header class="resource-purchase-modal__head">
          <div class="resource-purchase-modal__titles">
            <p class="resource-purchase-modal__eyebrow">数字化资源</p>
            <h3>购买确认</h3>
          </div>
          <button
            type="button"
            class="resource-purchase-modal__close"
            aria-label="关闭"
            @click="closePurchasePanel"
          >
            ×
          </button>
        </header>

        <p v-if="resource" class="resource-purchase-modal__subject">
          <strong>{{ resource.title }}</strong>
        </p>

        <div class="resource-purchase-modal__amount" aria-live="polite">
          <span>{{ isPointsListing ? '应付积分' : '应付金额' }}</span>
          <strong>{{ priceLabel }}</strong>
        </div>

        <p v-if="isPointsListing" class="resource-purchase-modal__balance">
          当前积分余额：
          <strong>{{ buyerPointsBalance == null ? '加载中…' : buyerPointsBalance }}</strong>
        </p>

        <ul class="resource-purchase-modal__notes">
          <li>本商品为数字化资源（虚拟商品），支付成功后获得下载权。</li>
          <li v-if="isPointsListing">确认后立即扣积分并解锁下载；平台抽成后净额计入卖家积分账户。</li>
          <li>尚未产生成功下载前可申请退款；下载成功后不支持自助退款。</li>
        </ul>

        <div
          v-if="!isPointsListing"
          class="payment-options"
          role="radiogroup"
          aria-label="支付方式选择"
        >
          <button
            type="button"
            class="payment-option"
            :class="{
              active: purchaseChannel === 'alipay',
              'payment-option--alipay': purchaseChannel === 'alipay',
            }"
            :disabled="purchaseSubmitting"
            @click="selectPurchaseChannel('alipay')"
          >
            <img class="payment-option-icon" src="/icons/alipay.png" alt="" />
            支付宝
          </button>
          <button
            type="button"
            class="payment-option"
            :class="{
              active: purchaseChannel === 'wechat',
              'payment-option--wechat': purchaseChannel === 'wechat',
            }"
            :disabled="purchaseSubmitting"
            @click="selectPurchaseChannel('wechat')"
          >
            <img class="payment-option-icon" src="/icons/wechat-pay.png" alt="" />
            微信
          </button>
        </div>

        <p v-if="purchaseError" class="resource-purchase-modal__error" role="alert">
          {{ purchaseError }}
        </p>

        <div
          v-if="!isPointsListing && (purchaseQrDataUrl || purchaseSubmitting || purchaseOrder?.order_no)"
          class="resource-purchase-modal__qr"
        >
          <img
            v-if="purchaseQrDataUrl"
            :src="purchaseQrDataUrl"
            alt="支付二维码"
            width="220"
            height="220"
          />
          <p v-else-if="purchaseSubmitting" class="resource-purchase-modal__order">
            正在获取支付码…
          </p>
          <p v-else-if="purchaseOrder?.order_no" class="resource-purchase-modal__order">
            订单号 {{ purchaseOrder.order_no }} · {{ purchaseOrder.status }}
          </p>
        </div>

        <div v-if="isPointsListing" class="actions">
          <button
            class="ghost primary"
            type="button"
            :disabled="purchaseSubmitting"
            @click="submitPurchase"
          >
            {{ purchaseSubmitting ? '兑换中...' : `确认兑换 ${priceLabel}` }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.resource-detail-page {
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
.resource-detail-page__content-card,
.resource-detail-page__version-card {
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

.resource-detail-page__cover-image,
.resource-detail-page__cover-placeholder {
  display: block;
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
.resource-detail-page__version-headline,
.resource-detail-page__version-meta,
.resource-detail-page__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.resource-detail-page__status-pill,
.resource-detail-page__author-pill,
.resource-detail-page__meta-chip {
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

.resource-purchase-modal-wrap {
  z-index: 90;
  background: rgba(15, 23, 42, 0.28);
  backdrop-filter: blur(4px);
}

.resource-purchase-modal {
  width: min(440px, 100%);
  display: grid;
  gap: 16px;
  padding: 22px 22px 20px;
  border-radius: 24px;
  border: 1px solid rgba(198, 210, 236, 0.95);
  background:
    radial-gradient(circle at top right, rgba(191, 219, 254, 0.55), transparent 42%),
    rgba(255, 255, 255, 0.97);
  box-shadow: 0 22px 48px rgba(37, 66, 130, 0.18);
}

.resource-purchase-modal__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.resource-purchase-modal__titles {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.resource-purchase-modal__eyebrow {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #64748b;
}

.resource-purchase-modal__head h3 {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.25;
}

.resource-purchase-modal__close {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border: 1px solid rgba(203, 213, 225, 0.95);
  border-radius: 999px;
  background: rgba(248, 250, 252, 0.96);
  color: #64748b;
  cursor: pointer;
  font-size: 22px;
  line-height: 1;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
}

.resource-purchase-modal__close:hover {
  color: #0f172a;
  border-color: rgba(148, 163, 184, 0.9);
  background: #fff;
}

.resource-purchase-modal__subject {
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.96);
  border: 1px solid rgba(226, 232, 240, 0.95);
  color: #334155;
  font-size: 13px;
  line-height: 1.5;
}

.resource-purchase-modal__subject strong {
  display: block;
  color: #0f172a;
  font-size: 14px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 金额块：上下两行、两行都水平居中（原为左右两端对齐） */
.resource-purchase-modal__amount {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid rgba(253, 186, 116, 0.55);
  background: linear-gradient(135deg, rgba(255, 247, 237, 0.98), rgba(255, 237, 213, 0.72));
  text-align: center;
}

.resource-purchase-modal__amount span {
  color: #9a3412;
  font-size: 13px;
  font-weight: 700;
}

.resource-purchase-modal__amount strong {
  color: #9a3412;
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1;
}

.resource-purchase-modal__balance {
  margin: 0;
  color: #475569;
  font-size: 13px;
  line-height: 1.5;
}

.resource-purchase-modal__balance strong {
  color: #0f172a;
  font-weight: 700;
}

.resource-purchase-modal__notes {
  margin: 0;
  padding: 12px 14px 12px 30px;
  border-radius: 14px;
  border: 1px solid rgba(191, 219, 254, 0.85);
  background: rgba(239, 246, 255, 0.72);
  color: #334155;
  font-size: 13px;
  line-height: 1.65;
}

.resource-purchase-modal__notes li + li {
  margin-top: 4px;
}

/* 失败原因：与上方说明块同构，换成告警色，长文案允许换行 */
.resource-purchase-modal__error {
  margin: 0;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(252, 165, 165, 0.85);
  background: rgba(254, 242, 242, 0.9);
  color: #b91c1c;
  font-size: 13px;
  line-height: 1.65;
  word-break: break-word;
}

.resource-purchase-modal .payment-options {
  margin: 0;
}

.resource-purchase-modal .actions {
  margin-top: 2px;
  justify-content: flex-end;
}

.resource-purchase-modal__qr {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 10px;
  min-height: 248px;
  padding: 14px;
  border-radius: 16px;
  border: 1px dashed rgba(148, 163, 184, 0.7);
  background: rgba(248, 250, 252, 0.9);
  text-align: center;
  color: #475569;
  font-size: 13px;
  line-height: 1.55;
}

.resource-purchase-modal__qr img {
  border-radius: 12px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  background: #fff;
}

.resource-purchase-modal__order {
  margin: 0;
}

.resource-purchase-modal__order {
  font-size: 12px;
  color: #64748b;
  text-align: center;
}

@media (max-width: 640px) {
  .resource-purchase-modal {
    width: min(100%, 100%);
    gap: 14px;
    padding: 18px 16px 16px;
    border-radius: 20px;
  }

  .resource-purchase-modal__amount strong {
    font-size: 24px;
  }

  .resource-purchase-modal .actions {
    display: grid;
    grid-template-columns: 1fr 1.4fr;
  }

  .resource-purchase-modal .actions .ghost {
    width: 100%;
  }
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
.resource-detail-page__paragraph,
.resource-detail-page__version-meta span,
.resource-detail-page__rich-text :deep(p),
.resource-detail-page__rich-text :deep(blockquote),
.resource-detail-page__rich-text :deep(ul),
.resource-detail-page__rich-text :deep(ol),
.resource-detail-page__rich-text :deep(td) {
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

.resource-detail-page__meta-chip {
  color: #1d4ed8;
  background: rgba(219, 234, 254, 0.92);
}

.resource-detail-page__summary-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 2px;
}

.resource-detail-page__summary-stat {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(219, 229, 247, 0.78);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(248, 250, 252, 0.86));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.82);
}

.resource-detail-page__summary-stat strong {
  color: #0f172a;
  font-size: 24px;
  line-height: 1.2;
}

.resource-detail-page__summary-stat span {
  color: #475569;
  font-size: 13px;
  font-weight: 800;
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

.resource-detail-page__primary-btn,
.resource-detail-page__like-btn,
.resource-detail-page__secondary-btn,
.resource-detail-page__version-download {
  border: 0;
  border-radius: 12px;
  min-height: 44px;
  padding: 0 16px;
  cursor: pointer;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    background-color 180ms ease;
}

.resource-detail-page__primary-btn:hover,
.resource-detail-page__like-btn:hover,
.resource-detail-page__secondary-btn:hover,
.resource-detail-page__version-download:hover {
  transform: translateY(-1px);
}

.resource-detail-page__primary-btn {
  border: 0;
  color: #fff;
  background: linear-gradient(135deg, #2563eb, #4f8cff);
  font-weight: 700;
  box-shadow: 0 14px 26px rgba(37, 99, 235, 0.2);
}

.resource-detail-page__primary-btn:disabled {
  cursor: wait;
  opacity: 0.78;
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

.resource-detail-page__secondary-btn,
.resource-detail-page__version-download {
  color: #1d4ed8;
  background: rgba(239, 246, 255, 0.9);
  font-weight: 700;
}

.resource-detail-page__version-download {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 10px;
  font-size: 13px;
}

.resource-detail-page__like-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: #64748b;
  background: rgba(248, 250, 252, 0.96);
  font-weight: 800;
  border: 1px solid rgba(219, 229, 247, 0.82);
}

.resource-detail-page__like-btn strong {
  color: inherit;
  font-size: 13px;
}

.resource-detail-page__like-btn--active {
  color: #dc2626;
  background: rgba(254, 226, 226, 0.94);
  border-color: rgba(248, 113, 113, 0.38);
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

/* 文本块级元素占满整行；行内媒体（如 badge 图片）可并排同行 */
.resource-detail-page__rich-text :deep(p),
.resource-detail-page__rich-text :deep(h2),
.resource-detail-page__rich-text :deep(h3),
.resource-detail-page__rich-text :deep(h4),
.resource-detail-page__rich-text :deep(ul),
.resource-detail-page__rich-text :deep(ol),
.resource-detail-page__rich-text :deep(blockquote),
.resource-detail-page__rich-text :deep(pre),
.resource-detail-page__rich-text :deep(hr),
.resource-detail-page__rich-text :deep(table) {
  flex: 0 0 100%;
}

.resource-detail-page__rich-text :deep(h2) {
  margin: 0 0 12px;
  color: #0f172a;
  font-size: 22px;
  line-height: 1.35;
}

.resource-detail-page__rich-text :deep(h1) {
  margin: 0 0 14px;
  color: #0f172a;
  font-size: 28px;
  line-height: 1.2;
}

.resource-detail-page__rich-text :deep(h3) {
  margin: 0 0 12px;
  color: #0f172a;
  font-size: 18px;
  line-height: 1.4;
}

.resource-detail-page__rich-text :deep(blockquote) {
  margin: 0 0 12px;
  padding-left: 14px;
  border-left: 3px solid rgba(96, 165, 250, 0.34);
}

.resource-detail-page__rich-text :deep(ul),
.resource-detail-page__rich-text :deep(ol) {
  margin: 0 0 12px;
  padding-left: 22px;
}

.resource-detail-page__rich-text :deep(a) {
  color: #2563eb;
}

.resource-detail-page__rich-text :deep(.rich-editor-media) {
  display: block;
  max-width: 100%;
  margin: 12px 0;
  border: 1px solid rgba(203, 213, 225, 0.86);
  border-radius: 14px;
  background: #f8fafc;
}

.resource-detail-page__rich-text :deep(.rich-editor-image) {
  display: inline-block;
  vertical-align: middle;
  height: auto;
}

.resource-detail-page__rich-text :deep(img) {
  display: inline-block;
  vertical-align: middle;
  max-width: 100%;
  height: auto;
}

.resource-detail-page__rich-text :deep(.rich-editor-video) {
  width: 100%;
  min-height: 220px;
}

.resource-detail-page__rich-text :deep(.rich-editor-attachment) {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  margin: 10px 0;
  padding: 9px 12px;
  border: 1px solid rgba(191, 219, 254, 0.96);
  border-radius: 10px;
  background: rgba(239, 246, 255, 0.9);
  color: #1d4ed8;
  font-weight: 800;
  text-decoration: none;
  overflow-wrap: anywhere;
}

.resource-detail-page__rich-text :deep(hr) {
  margin: 18px 0;
  border: 0;
  border-top: 1px solid rgba(226, 232, 240, 0.9);
}

.resource-detail-page__rich-text :deep(.rich-table-scroll) {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  margin: 0 0 14px;
  max-width: 100%;
}

.resource-detail-page__rich-text :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 14px;
}

.resource-detail-page__rich-text :deep(.rich-table-scroll > table) {
  width: max-content;
  min-width: 100%;
  margin: 0;
}

.resource-detail-page__rich-text :deep(th),
.resource-detail-page__rich-text :deep(td) {
  padding: 10px 12px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  text-align: left;
}

.resource-detail-page__rich-text :deep(th) {
  color: #0f172a;
  background: rgba(239, 246, 255, 0.96);
}

.resource-detail-page__version-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: min(680px, calc(100vh - 220px));
  overflow-y: auto;
  padding-right: 8px;
  scrollbar-gutter: stable;
}

.resource-detail-page__version-card {
  border-radius: 18px;
  padding: 18px 18px 5px;
}

.resource-detail-page__version-note-wrap {
  margin-top: 4px;
}

.resource-detail-page__version-note {
  margin: 0;
  color: #334155;
  line-height: 1.8;
}

.resource-detail-page__version-note :deep(p),
.resource-detail-page__version-note :deep(ul),
.resource-detail-page__version-note :deep(ol),
.resource-detail-page__version-note :deep(blockquote) {
  color: #334155;
  line-height: 1.8;
  margin: 8px 0;
}

.resource-detail-page__version-note :deep(p:first-child),
.resource-detail-page__version-note :deep(ul:first-child),
.resource-detail-page__version-note :deep(ol:first-child),
.resource-detail-page__version-note :deep(blockquote:first-child) {
  margin-top: 0;
}

.resource-detail-page__version-note :deep(p:last-child),
.resource-detail-page__version-note :deep(ul:last-child),
.resource-detail-page__version-note :deep(ol:last-child),
.resource-detail-page__version-note :deep(blockquote:last-child) {
  margin-bottom: 0;
}

.resource-detail-page__version-note :deep(code) {
  color: #0f172a;
}

.resource-detail-page__version-note.is-collapsed {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.resource-detail-page__version-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  margin-top: 5px;
  padding-top: 5px;
  border-top: 1px solid rgba(219, 229, 247, 0.78);
}

.resource-detail-page__version-note-toggle {
  position: sticky;
  top: 8px;
  float: right;
  margin: -25px 0 8px 12px;
  padding: 4px 14px;
  border: none;
  border-radius: 999px;
  background: rgba(100, 116, 139, 0.09);
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
  cursor: pointer;
  transition: background-color 0.2s;
  white-space: nowrap;
  z-index: 2;
}

.resource-detail-page__version-note-toggle:hover {
  background: rgba(100, 116, 139, 0.18);
}

.resource-detail-page__version-meta strong {
  color: #0f172a;
}

.resource-detail-page__comments-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.resource-detail-page__comment-composer,
.resource-detail-page__comment-item {
  border-radius: 18px;
  border: 1px solid rgba(198, 210, 236, 0.72);
  background: rgba(255, 255, 255, 0.78);
}

.resource-detail-page__comment-composer {
  padding: 16px;
}

.resource-detail-page__comment-gate {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.resource-detail-page__comment-gate strong,
.resource-detail-page__comment-meta strong {
  color: #0f172a;
}

.resource-detail-page__comment-gate p,
.resource-detail-page__comment-body p,
.resource-detail-page__comment-meta span,
.resource-detail-page__comment-count {
  margin: 0;
  color: #64748b;
  line-height: 1.7;
}

.resource-detail-page__comment-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.resource-detail-page__comment-input {
  width: 100%;
  min-height: 108px;
  resize: vertical;
  border: 1px solid rgba(198, 210, 236, 0.86);
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.96);
  color: #0f172a;
  padding: 12px 14px;
  font: inherit;
  line-height: 1.7;
  outline: none;
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease,
    background-color 180ms ease;
}

.resource-detail-page__comment-input:focus {
  border-color: rgba(37, 99, 235, 0.58);
  background: #fff;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.1);
}

.resource-detail-page__comment-toolbar,
.resource-detail-page__comment-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.resource-detail-page__comment-count {
  font-size: 13px;
  font-weight: 700;
}

.resource-detail-page__comment-count.danger {
  color: #dc2626;
}

.resource-detail-page__comment-action,
.resource-detail-page__comment-submit {
  border: 0;
  border-radius: 12px;
  min-height: 40px;
  padding: 0 16px;
  color: #fff;
  background: linear-gradient(135deg, #2563eb, #4f8cff);
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    opacity 180ms ease;
}

.resource-detail-page__comment-action:hover,
.resource-detail-page__comment-submit:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 12px 22px rgba(37, 99, 235, 0.18);
}

.resource-detail-page__comment-submit:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.resource-detail-page__comment-list {
  min-height: 72px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.resource-detail-page__comment-item {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 12px;
  padding: 14px;
}

.resource-detail-page__comment-item.mine {
  border-color: rgba(37, 99, 235, 0.26);
  background: rgba(239, 246, 255, 0.82);
}

.resource-detail-page__comment-avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #1d4ed8;
  background: rgba(219, 234, 254, 0.95);
  font-weight: 800;
}

.resource-detail-page__comment-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.resource-detail-page__comment-body p {
  white-space: pre-wrap;
  word-break: break-word;
}

.resource-detail-page__comment-meta span {
  font-size: 12px;
}

@media (max-width: 980px) {
  .resource-detail-page__lead {
    grid-template-columns: 1fr;
  }

  .resource-detail-page__left-stack,
  .resource-detail-page__versions-side-card {
    grid-column: auto;
    grid-row: auto;
  }
}

@media (max-width: 900px) {
  .resource-detail-page {
    width: calc(100% - 16px);
  }
}

@media (max-width: 640px) {
  .resource-detail-page__panel {
    padding: 18px;
  }

  .resource-detail-page__version-list {
    max-height: min(520px, calc(100vh - 260px));
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

  .resource-detail-page__version-headline {
    align-items: flex-start;
  }

  .resource-detail-page__summary-stats {
    grid-template-columns: 1fr;
  }

  .resource-detail-page__cta-row,
  .resource-detail-page__primary-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .resource-detail-page__primary-btn,
  .resource-detail-page__like-btn,
  .resource-detail-page__primary-actions :deep(.share-card-generator),
  .resource-detail-page__primary-actions :deep(.share-card-generator__start),
  .resource-detail-page__secondary-btn {
    width: 100%;
  }

  .resource-detail-page__comment-gate,
  .resource-detail-page__comment-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .resource-detail-page__comment-action,
  .resource-detail-page__comment-submit {
    width: 100%;
  }

  .resource-detail-page__comment-item {
    grid-template-columns: 36px minmax(0, 1fr);
  }

  .resource-detail-page__comment-avatar {
    width: 36px;
    height: 36px;
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

/* 内嵌形态里版本列表不跟着页面无限拉长：超过一定高度由它自己滚 */
.resource-detail-page--panel .resource-detail-page__version-list {
  max-height: 420px;
}

/* 窄档（与组件自带的 980 断点同一档）：lead 压成单列、封面收窄、标题降一档 */
@media (max-width: 980px) {
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
