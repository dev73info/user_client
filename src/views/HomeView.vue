<script setup lang="ts">
import '@/styles/home.css'

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { TIcon, ArrowRight, TMessage } from 'ui_73info'

import { useAuthStore } from '@/stores/auth'
import AuthModal from '@/components/AuthModal.vue'
import WechatLoginQrModal from '@/components/WechatLoginQrModal.vue'
import PublishModal from '@/components/PublishModal.vue'
import DepositModal from '@/components/DepositModal.vue'
import DeveloperRankCard from '@/components/home/DeveloperRankCard.vue'
import PortalBetaCard from '@/components/home/PortalBetaCard.vue'
import PortalMilestoneCard from '@/components/home/PortalMilestoneCard.vue'
import PortalNoticeCard from '@/components/home/PortalNoticeCard.vue'
import SpotlightResourceSection from '@/components/home/SpotlightResourceSection.vue'
import TeamRankCard from '@/components/home/TeamRankCard.vue'
import { buildDevPortalUrl } from '@/config/runtime'
import { useAuthForm } from '@/composables/useAuthForm'
import { useHomeAuthQuery } from '@/composables/useHomeAuthQuery'
import { useHomeCheckin } from '@/composables/useHomeCheckin'
import { usePortalRanks } from '@/composables/usePortalRanks'
import { usePublicResources } from '@/composables/usePublicResources'
import { useDepositPayment } from '@/composables/useDepositPayment'
import {
  useHomePortalLoaders,
  type PendingRequirementView,
} from '@/composables/useHomePortalLoaders'
import { useRequirementPublish, type AuthMode } from '@/composables/useRequirementPublish'
import type { SpotlightCard } from '@/composables/useSpotlightCards'
import {
  buildMilestoneStats,
  buildPortalNotices,
  formatMoney,
  type PortalMilestoneStat,
  type PortalNotice,
} from '@/shared/home/portalDisplay'
import { resourceDetailLocation, resourceListingSaleOf } from '@/shared/resourceNavigation'
import { HttpError } from '@/api/http'
import { likePublicMcResource, unlikePublicMcResource } from '@/api/resources'
import { resetSeoMeta, setSeoMeta } from '@/utils/seo'

type WorkflowStep = {
  step: string
  title: string
  summary: string
  icon: string
  accent: string
  actionLabel: string
  action: 'publish' | 'progress' | 'developer'
}

type QuickPanel = {
  title: string
  summary: string
  action: string
  tone: 'gift' | 'briefcase'
}

const AUTO_REFRESH_INTERVAL_MS = 300_000

/**
 * 公开资源这一份状态由 `usePublicResources` 独占：侧栏榜单、公告卡、里程碑统计、
 * 精选资源区、点赞回写都读同一份，本视图不再自己建 ref（否则会出现两份数据源）。
 */
const {
  publicResources,
  highLikeThreshold,
  resolveResourceRoute,
  ensureTagTree,
  applyResourceList,
  applyHighLikeThreshold,
  applyLikeState,
} = usePublicResources()
const auth = useAuthStore()
const router = useRouter()

/**
 * 卸载标记：**只在视图这一份**，往下传的是只读 getter（`isMounted: () => isMounted`），
 * 各 composable 不许自持一份 —— 否则视图卸载后谁清谁不清就成了两套说法。
 */
let isMounted = true

/**
 * 首屏与轮询要拉的三批数据（待办需求 / 平台概览 / 公开资源·公告·精选需求）在
 * `useHomePortalLoaders`。押金比例那一路属支付域，跟着支付卡片走。
 */
const {
  metrics,
  latestDeals,
  publicDeveloperCount,
  pendingRequirements,
  publicRequirementSpotlights,
  announcementPosts,
  loadPendingRequirements,
  loadRequirementOverview,
  loadPublicPortalData,
} = useHomePortalLoaders({
  isMounted: () => isMounted,
  ensureTagTree,
  applyResourceList,
  applyHighLikeThreshold,
})

/**
 * 支付域（卡片状态 / 支付方式 / 押金比例 / 券 / 拉起 Adapay 与回跳确认）整块在 `useDepositPayment`，
 * 券那一支再下沉到 `useDepositCoupons`（模块行数预算）。传进去的两样都还留在视图：待办需求列表与重拉函数。
 */
const {
  depositChannel,
  depositPayment,
  depositLoading,
  depositRatioPercent,
  depositPolicyAccepted,
  contractSigningStatus,
  depositRequirement,
  isFinalPayment,
  paymentStageLabel,
  availableCoupons,
  amountCouponCode,
  discountCouponCode,
  couponLoading,
  couponSummary,
  couponFinalAmount,
  canOpenPayment,
  selectCoupon,
  updateDepositChannel,
  markUnionAuthorized,
  openDepositPayment,
  closeDepositCard,
  loadDepositRatio,
  loadAvailableCoupons,
  submitDepositPayment,
} = useDepositPayment({
  isMounted: () => isMounted,
  pendingRequirements,
  loadPendingRequirements: () => loadPendingRequirements(),
})

/** 侧栏两张榜单：资源由本视图统一请求后传进去，composable 只做聚合，不再发资源请求。 */
const { developerRanks, teamRanks, totalContribResources, developerBadges } =
  usePortalRanks(publicResources)
/** 侧栏「内测中」卡片里的每日签到（写操作 + 两个 api 都留在这支 composable 里）。 */
const {
  status: homeCheckinStatus,
  saving: checkinHomeSaving,
  load: loadHomeCheckin,
  checkin: handleHomeCheckin,
} = useHomeCheckin()

function openBetaGroup() {
  window.open(qqBetaGroupUrl, '_blank', 'noopener,noreferrer')
}

function openDeveloperProfile(username: string) {
  void router.push({ name: 'dev-profile', params: { username } })
}

function openTeamProfile(teamId: number) {
  void router.push({ name: 'team-profile', params: { teamId } })
}

/** OAuth / 支付授权回跳参数的读取与清理在 `useHomeAuthQuery`，URL 取值口径也只有那一份。 */
const { routeQueryValue, consumeAuthQuery } = useHomeAuthQuery({
  onUnionAuthorized: () => {
    markUnionAuthorized()
  },
})

const routeModal = computed(() => routeQueryValue('modal'))
const routeAuthMode = computed<AuthMode>(() => {
  const mode = routeQueryValue('mode') || 'login'
  return mode === 'register' || mode === 'reset' ? mode : 'login'
})
const authVisible = computed(() => routeModal.value === 'auth')
const publishVisible = computed(() => routeModal.value === 'publish')
const depositVisible = computed(() => routeModal.value === 'deposit')
const {
  authUsername,
  authPassword,
  authEmail,
  authEmailCode,
  authInviteCode,
  authShareType,
  authShareTargetId,
  authTurnstileToken,
  acceptTerms,
  loginRequiresTwoFactor,
  sendCodeLoading,
  sendCodeCountdown,
  githubLoading,
  giteeLoading,
  wechatLoginLoading,
  qqLoginLoading,
  githubAvailable,
  wechatAvailable,
  qqAvailable,
  giteeAvailable,
  resetAuthForm,
  loginWithGithub,
  loginWithGitee,
  loginWithWechat,
  wechatQrLogin,
  closeWechatQrLogin,
  refreshWechatQrLogin,
  handleWechatQrToken,
  loginWithQq,
  sendAuthCode: sendAuthCodeAction,
  submitAuth: submitAuthAction,
} = useAuthForm(routeAuthMode)
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null
let autoRefreshInFlight = false
/**
 * 发布域（表单状态 / 实名门禁 / 校验 / `POST` 与 `PATCH` 提交）整块在 `useRequirementPublish`。
 * 这里传进去的三样都还留在视图：卸载标记、登录弹窗入口、发布后重拉待办需求。
 */
const {
  publishTitle,
  publishDescription,
  publishBudget,
  publishAcceptance,
  publishPaymentMode,
  publishDevelopmentCycleDays,
  activeResubmitRequirementId,
  publishLoading,
  publishModalRef,
  publishModalTitle,
  publishModalSubmitText,
  publishModalLoadingText,
  startResubmit,
  openPublishModal,
  closePublishModal,
  submitPublishRequirement,
} = useRequirementPublish({
  isMounted: () => isMounted,
  openAuth: (mode, redirectTo) => openAuth(mode, redirectTo),
  loadPendingRequirements: () => loadPendingRequirements(),
})
function notify(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
  TMessage[type](message)
}

const heroSignals = ['免费资源共享', '需求记录留痕', '工单沟通协作']
const qqBetaGroupUrl = 'https://qm.qq.com/q/AXb3VBPurC'
const isDeveloperAccount = computed(() => auth.role === 'dev' || auth.role === 'super_admin')
const devActionLabel = computed(() => (isDeveloperAccount.value ? '我要接单' : '成为开发者'))

const portalNotices = computed<PortalNotice[]>(() => {
  const resource = publicResources.value[0]
  return buildPortalNotices({
    posts: announcementPosts.value,
    latestDeal: latestDeals.value[0],
    resource,
    resourceRoute: resource ? resolveResourceRoute(resource) : null,
    spotlight: publicRequirementSpotlights.value[0],
  })
})

const quickPanels = computed<QuickPanel[]>(() => [
  {
    title: '免费资源',
    summary: 'Minecraft、网站与工具资源\n发现并复用现成的优质内容',
    action: '立即查看',
    tone: 'gift',
  },
  {
    title: '社区交流',
    summary: '社区互动、动态分享与内容交流\n结识同好、展示成果与获取灵感',
    action: '进入社区',
    tone: 'briefcase',
  },
])

const workflowSteps: WorkflowStep[] = [
  {
    step: '1',
    title: '提交需求',
    summary: '填写需求与预算',
    icon: '▣',
    accent: 'violet',
    actionLabel: '发布需求',
    action: 'publish',
  },
  {
    step: '2',
    title: '需求审核',
    summary: 'AI+人工复核\n确认需求信息',
    icon: '☑',
    accent: 'blue',
    actionLabel: '查看进度',
    action: 'progress',
  },
  {
    step: '3',
    title: '开发者接单',
    summary: '开发者接单\n开始工作',
    icon: '⊞',
    accent: 'green',
    actionLabel: '开发者入口',
    action: 'developer',
  },
  {
    step: '4',
    title: '完成验收',
    summary: '确认需求',
    icon: '☑',
    accent: 'violet',
    actionLabel: '我的需求',
    action: 'progress',
  },
  {
    step: '5',
    title: '评价完成',
    summary: '交易完成\n双方评价',
    icon: '♥',
    accent: 'red',
    actionLabel: '评价订单',
    action: 'progress',
  },
]

async function openDevWorkbench() {
  if (isDeveloperAccount.value) {
    void router.push({ name: 'dev-requirement-hall' })
    return
  }

  if (!auth.isAuthed) {
    void router.push(buildDevPortalUrl(auth.token))
    return
  }

  await router.push({ name: 'dev-requirement-hall' })
}

function openResourceInit() {
  void router.push({ name: 'dev-plugins' })
}

function openQuickPanel(panel: QuickPanel) {
  if (panel.tone === 'gift') {
    void router.push({ name: 'resources', query: { sale: 'free' } })
    return
  }

  // briefcase（社区交流）：跳转到社区页面。
  void router.push({ name: 'community' })
}

function openWorkflowStep(step: WorkflowStep) {
  if (step.action === 'publish') {
    void openPublishModal()
    return
  }

  if (step.action === 'developer') {
    openDevWorkbench()
    return
  }

  if (!auth.isAuthed) {
    TMessage.info('登录后可查看需求进度')
    openAuth('login')
    return
  }

  void router.push({ name: 'workbench-requirements' })
}

function openPortalNotice(notice: PortalNotice) {
  if (!notice.to) {
    return
  }

  void router.push(notice.to)
}

function openSpotlight(card: SpotlightCard) {
  if (card.kind === 'resource' && card.resourceId != null) {
    const target = publicResources.value.find((item) => item.id === card.resourceId)
    if (!target) {
      TMessage.info('资源详情正在加载中')
      return
    }

    const routeParams = resolveResourceRoute(target)
    if (!routeParams) {
      TMessage.warning('资源目录暂未配置完整标签路由')
      return
    }

    void router.push(
      resourceDetailLocation({
        resourceId: target.id,
        rootSlug: routeParams.rootSlug,
        entrySlug: routeParams.entrySlug,
        sale: resourceListingSaleOf(target.price_fen, target.price_points),
      }),
    )
    return
  }

  const target = pendingRequirements.value.find((item) => item.title === card.title)
  if (target && canOpenPayment(target)) {
    openDepositCard(target)
    return
  }

  TMessage.info('请进入需求大厅查看需求')
}

const platformStats = computed<PortalMilestoneStat[]>(() =>
  buildMilestoneStats({
    developerCount: publicDeveloperCount.value,
    resourceCount: publicResources.value.length,
    completedLabel: metrics.value[0]?.value,
  }),
)

const authTitle = computed(() => {
  if (routeAuthMode.value === 'login') {
    return '登录账号'
  }
  if (routeAuthMode.value === 'register') {
    return '注册账号'
  }
  return '找回密码'
})

const authRedirectTarget = computed(() => {
  const raw = routeQueryValue('redirect_to')
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
    return ''
  }
  return raw
})

const routeInviteCode = computed(() => {
  const raw = routeQueryValue('invite_code')
  return raw && /^[A-Za-z0-9]{1,32}$/.test(raw) ? raw : ''
})

const routeShareType = computed(() => {
  const raw = routeQueryValue('share_type')
  return ['requirement', 'portfolio', 'resource', 'community_post'].includes(raw) ? raw : ''
})

const routeShareTargetId = computed(() => {
  const raw = routeQueryValue('share_target_id') || routeQueryValue('target_id')
  return raw && /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : ''
})

watch(
  () =>
    [
      routeInviteCode.value,
      routeShareType.value,
      routeShareTargetId.value,
      routeAuthMode.value,
    ] as const,
  ([inviteCode, shareType, shareTargetId, mode]) => {
    if (mode === 'register' && inviteCode) {
      authInviteCode.value = inviteCode
      authShareType.value = shareType
      authShareTargetId.value = shareTargetId
    }
  },
  { immediate: true },
)

watch(
  () => auth.isAuthed,
  () => {
    void loadHomeCheckin()
    // 登录态变化后重拉公开资源，补齐 / 清空 liked_by_me。
    void loadPublicPortalData(true)
  },
)

/**
 * 精选卡片的点赞提交态。卡片在 `SpotlightResourceSection` 里，只负责回抛 `like`；
 * 请求、登录门禁与 toast 留在这里（子组件不碰 token）。
 *
 * 冒泡已在子组件用 `@click.stop` 挡掉：那一下不能同时触发卡片的 `open`，
 * 所以这里**不再**接 DOM 事件 —— 传进来的只有卡片本身。
 */
const spotlightLikeSubmittingIds = ref<Set<number>>(new Set())

function openSpotlightLikeLogin() {
  TMessage.info('请先登录后再点赞')
  openAuth('login')
}

async function toggleSpotlightLike(card: SpotlightCard) {
  const resourceId = card.resourceId
  if (resourceId == null) {
    return
  }
  if (spotlightLikeSubmittingIds.value.has(resourceId)) {
    return
  }
  if (!auth.isAuthed || !auth.token.trim()) {
    openSpotlightLikeLogin()
    return
  }

  const nextSubmitting = new Set(spotlightLikeSubmittingIds.value)
  nextSubmitting.add(resourceId)
  spotlightLikeSubmittingIds.value = nextSubmitting

  try {
    const state = card.likedByMe
      ? await unlikePublicMcResource(auth.token, resourceId)
      : await likePublicMcResource(auth.token, resourceId)
    // 回写 + 失效列表缓存都在 `usePublicResources` 里，视图不自己拼那一份状态。
    applyLikeState(resourceId, state)
    TMessage.success(state.liked_by_me ? '已点赞' : '已取消点赞')
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      auth.logout()
      openSpotlightLikeLogin()
    } else {
      TMessage.error(error instanceof Error ? error.message : '点赞操作失败')
    }
  } finally {
    const done = new Set(spotlightLikeSubmittingIds.value)
    done.delete(resourceId)
    spotlightLikeSubmittingIds.value = done
  }
}

onMounted(() => {
  setSeoMeta({
    title: '73Info 柒叁信息 - 资源与需求协作平台',
    description:
      '73Info 柒叁信息面向网站开发和小工具场景提供免费资源浏览、需求发布、开发者协作、沟通记录、工单跟进与合规说明服务。',
    path: '/',
  })

  auth.hydrate()
  void loadHomeCheckin()

  // 紧接登录态：先消费一次性的授权回跳参数（登录 / 微信 / 云闪付），并清掉地址栏上的那份。
  consumeAuthQuery()

  void Promise.all([
    loadDepositRatio(),
    loadPendingRequirements(),
    loadRequirementOverview(),
    loadPublicPortalData(),
  ])

  autoRefreshTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') {
      return
    }
    if (publishLoading.value || depositLoading.value || auth.loading) {
      return
    }
    void runBackgroundAutoRefresh()
  }, AUTO_REFRESH_INTERVAL_MS)
})

onBeforeUnmount(() => {
  isMounted = false
  resetSeoMeta()
  resetAuthForm()
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer)
    autoRefreshTimer = null
  }
})

async function runBackgroundAutoRefresh() {
  if (autoRefreshInFlight) {
    return
  }

  autoRefreshInFlight = true
  try {
    if (auth.isAuthed) {
      await Promise.all([
        loadDepositRatio(),
        loadPendingRequirements(true),
        loadRequirementOverview(),
        loadPublicPortalData(true),
      ])
    } else {
      await Promise.all([
        loadPendingRequirements(true),
        loadRequirementOverview(),
        loadPublicPortalData(true),
      ])
    }
  } finally {
    autoRefreshInFlight = false
  }
}

/**
 * 列表行 / 精选卡片的统一入口。**必须留在视图 setup 顶层**：
 * `publishDevCycleHomeChain.spec.ts` 直接 `setupState.openDepositCard(...)` 调它进「重新编辑」态。
 * 只做分流：「驳回」交给发布域的 `startResubmit`，待付定金 / 尾款交给支付域的 `openDepositPayment`。
 */
function openDepositCard(item: PendingRequirementView) {
  if (item.status === 'rejected') {
    startResubmit(item)
    return
  }
  openDepositPayment(item)
}

function openAuth(mode: AuthMode, redirectTo = authRedirectTarget.value) {
  const inviteCodeToKeep = authInviteCode.value.trim() || routeInviteCode.value
  const shareTypeToKeep = authShareType.value.trim() || routeShareType.value
  const shareTargetIdToKeep = authShareTargetId.value.trim() || routeShareTargetId.value
  resetAuthForm()
  const nextQuery: Record<string, string> = { modal: 'auth', mode }
  const normalizedRedirectTo = redirectTo.trim()
  if (
    normalizedRedirectTo &&
    normalizedRedirectTo.startsWith('/') &&
    !normalizedRedirectTo.startsWith('//')
  ) {
    nextQuery.redirect_to = normalizedRedirectTo
  }
  if (inviteCodeToKeep) {
    nextQuery.invite_code = inviteCodeToKeep
  }
  if (shareTypeToKeep) {
    nextQuery.share_type = shareTypeToKeep
  }
  if (shareTargetIdToKeep) {
    nextQuery.share_target_id = shareTargetIdToKeep
  }
  if (mode === 'register' && inviteCodeToKeep) {
    authInviteCode.value = inviteCodeToKeep
    authShareType.value = shareTypeToKeep
    authShareTargetId.value = shareTargetIdToKeep
  }
  router.push({ name: 'home', query: nextQuery })
}

function closeAuth() {
  acceptTerms.value = false
  router.replace({ name: 'home' })
}

async function sendAuthCode() {
  await sendAuthCodeAction()
}

async function submitAuth() {
  const result = await submitAuthAction()
  if (result) {
    acceptTerms.value = false
    if (authRedirectTarget.value) {
      void router.replace(authRedirectTarget.value)
      return
    }

    void router.replace({ name: 'home' })
    await Promise.all([
      loadDepositRatio(),
      loadPendingRequirements(),
      loadRequirementOverview(),
      loadPublicPortalData(),
    ])
  }
}

function openPrimaryPublishAction() {
  if (isDeveloperAccount.value) {
    void router.push({ name: 'dev-plugins' })
    return
  }

  void openPublishModal()
}
</script>

<template>
  <main id="top" class="portal-home">
    <div class="portal-shell">
      <div class="portal-layout">
        <div class="portal-main">
          <section class="portal-hero">
            <div class="portal-hero__main">
              <div class="portal-hero__copy">
                <h1>
                  <span>资源与需求</span><span class="portal-title-accent">协作</span
                  ><span>平台</span>
                </h1>

                <div v-if="heroSignals.length" class="portal-signal-list">
                  <span v-for="signal in heroSignals" :key="signal" class="portal-signal">{{
                    signal
                  }}</span>
                </div>

                <div class="portal-hero__actions">
                  <button
                    class="portal-primary-action portal-publish-action"
                    type="button"
                    @click="openPrimaryPublishAction"
                  >
                    {{ isDeveloperAccount ? '发布资源' : '发布需求' }}
                  </button>
                  <button class="portal-secondary-action" type="button" @click="openDevWorkbench">
                    {{ devActionLabel }}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <!-- 移动端入口宫格：替代主视觉里的两颗按钮与下方两张大卡片，一个图标配一行字、上下排；
               主视觉在移动端只留作横幅（后期改轮播图） -->
          <nav class="portal-entry-grid" aria-label="快捷入口">
            <button
              type="button"
              class="portal-entry portal-entry--publish"
              @click="openPrimaryPublishAction"
            >
              <span class="portal-entry__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M12 16V4" />
                  <path d="m7 9 5-5 5 5" />
                  <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
                </svg>
              </span>
              <span class="portal-entry__label">{{
                isDeveloperAccount ? '发布资源' : '发布需求'
              }}</span>
            </button>
            <button type="button" class="portal-entry portal-entry--take" @click="openDevWorkbench">
              <span class="portal-entry__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="7" width="18" height="13" rx="2" />
                  <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <path d="M3 13h18" />
                </svg>
              </span>
              <span class="portal-entry__label">{{ devActionLabel }}</span>
            </button>
            <button
              type="button"
              class="portal-entry portal-entry--free"
              @click="router.push({ name: 'resources', query: { sale: 'free' } })"
            >
              <span class="portal-entry__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="8" width="18" height="4" rx="1" />
                  <path d="M12 8v13" />
                  <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
                  <path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
                </svg>
              </span>
              <span class="portal-entry__label">免费资源</span>
            </button>
            <button
              type="button"
              class="portal-entry portal-entry--community"
              @click="router.push({ name: 'community' })"
            >
              <span class="portal-entry__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
                  <path d="M8.5 12h.01M12 12h.01M15.5 12h.01" />
                </svg>
              </span>
              <span class="portal-entry__label">社区交流</span>
            </button>
          </nav>

          <section class="portal-quick-grid">
            <article
              v-for="panel in quickPanels"
              :key="panel.title"
              class="portal-quick-card"
              :class="`portal-quick-card--${panel.tone}`"
              role="button"
              tabindex="0"
              @click="openQuickPanel(panel)"
              @keydown.enter="openQuickPanel(panel)"
              @keydown.space.prevent="openQuickPanel(panel)"
            >
              <div class="portal-quick-card__icon" aria-hidden="true">
                <svg
                  v-if="panel.tone === 'gift'"
                  class="portal-quick-card__svg"
                  viewBox="0 0 96 96"
                  focusable="false"
                >
                  <defs>
                    <linearGradient id="quickGiftRed" x1="0" x2="1" y1="0" y2="1">
                      <stop offset="0%" stop-color="#ff8c5a" />
                      <stop offset="100%" stop-color="#ef3f5f" />
                    </linearGradient>
                    <linearGradient id="quickGiftYellow" x1="0" x2="1" y1="0" y2="1">
                      <stop offset="0%" stop-color="#ffd75f" />
                      <stop offset="100%" stop-color="#ff9f1c" />
                    </linearGradient>
                    <filter id="quickIconShadow" x="-30%" y="-20%" width="160%" height="160%">
                      <feDropShadow
                        dx="0"
                        dy="9"
                        stdDeviation="7"
                        flood-color="#ef4444"
                        flood-opacity="0.22"
                      />
                    </filter>
                  </defs>
                  <g filter="url(#quickIconShadow)">
                    <path
                      fill="url(#quickGiftRed)"
                      d="M17 38h62v39a7 7 0 0 1-7 7H24a7 7 0 0 1-7-7V38Z"
                    />
                    <path fill="#d9274a" d="M17 38h62v16H17z" opacity="0.45" />
                    <path fill="url(#quickGiftYellow)" d="M43 38h10v46H43zM12 28h72v16H12z" />
                    <path
                      fill="url(#quickGiftRed)"
                      d="M24 14c10-5 20 8 24 17-12 2-27 1-30-6-2-4 1-8 6-11Zm48 0c-10-5-20 8-24 17 12 2 27 1 30-6 2-4-1-8-6-11Z"
                    />
                    <path fill="url(#quickGiftYellow)" d="M42 20h12l-6 18-6-18Z" />
                  </g>
                </svg>
                <svg v-else class="portal-quick-card__svg" viewBox="0 0 96 96" focusable="false">
                  <defs>
                    <linearGradient id="quickCaseOrange" x1="0" x2="1" y1="0" y2="1">
                      <stop offset="0%" stop-color="#ffb15c" />
                      <stop offset="100%" stop-color="#f97316" />
                    </linearGradient>
                    <filter id="quickCaseShadow" x="-30%" y="-20%" width="160%" height="160%">
                      <feDropShadow
                        dx="0"
                        dy="9"
                        stdDeviation="7"
                        flood-color="#f97316"
                        flood-opacity="0.2"
                      />
                    </filter>
                  </defs>
                  <g filter="url(#quickCaseShadow)">
                    <path
                      fill="url(#quickCaseOrange)"
                      d="M20 30a12 12 0 0 1 12-12h32a12 12 0 0 1 12 12v22a12 12 0 0 1-12 12H44l-14 10v-10h-6a12 12 0 0 1-4-23z"
                    />
                    <circle cx="36" cy="44" r="4" fill="#fff7ed" />
                    <circle cx="48" cy="44" r="4" fill="#fff7ed" />
                    <circle cx="60" cy="44" r="4" fill="#fff7ed" />
                  </g>
                </svg>
              </div>
              <div class="portal-quick-card__copy">
                <h3>{{ panel.title }}</h3>
                <p>{{ panel.summary }}</p>
                <span class="portal-inline-action">
                  {{ panel.action }}
                  <TIcon>
                    <ArrowRight />
                  </TIcon>
                </span>
              </div>
            </article>
          </section>

          <section class="portal-section portal-section--workflow">
            <div class="portal-section__header">
              <div class="portal-section-title portal-section-title--plain">
                <h2>定制流程</h2>
              </div>
            </div>
            <div class="portal-workflow-grid" aria-label="定制流程">
              <div
                v-for="(step, index) in workflowSteps"
                :key="step.step + step.title"
                class="portal-workflow-item"
              >
                <button
                  class="portal-step-card"
                  :class="`portal-step-card--${step.accent}`"
                  type="button"
                  @click="openWorkflowStep(step)"
                >
                  <span class="portal-step-card__icon" aria-hidden="true">{{ step.icon }}</span>
                  <span class="portal-step-card__body">
                    <strong
                      ><i class="portal-step-card__no">{{ step.step }}. </i>{{ step.title }}</strong
                    >
                    <span>{{ step.summary }}</span>
                  </span>
                </button>
                <span
                  v-if="index < workflowSteps.length - 1"
                  class="portal-step-card__arrow"
                  aria-hidden="true"
                  >›</span
                >
              </div>
            </div>
          </section>

          <!-- 精选资源区（卡片映射 / 分页 / 跑马灯 / 点赞回抛）在 components/home/SpotlightResourceSection.vue -->
          <SpotlightResourceSection
            :resources="publicResources"
            :high-like-threshold="highLikeThreshold"
            :like-submitting-ids="spotlightLikeSubmittingIds"
            @open="openSpotlight"
            @like="toggleSpotlightLike"
            @more="router.push({ name: 'resources', query: { sale: 'free' } })"
          />
        </div>

        <aside class="portal-sidebar">
          <PortalBetaCard
            :is-authed="auth.isAuthed"
            :checkin="homeCheckinStatus"
            :checkin-saving="checkinHomeSaving"
            @checkin="handleHomeCheckin"
            @open-group="openBetaGroup"
          />

          <PortalNoticeCard
            :notices="portalNotices"
            @open-notice="openPortalNotice"
            @more="router.push({ name: 'community' })"
          />

          <PortalMilestoneCard
            :stats="platformStats"
            :is-developer-account="isDeveloperAccount"
            @open-resource-init="openResourceInit"
          />

          <DeveloperRankCard
            :ranks="developerRanks"
            :badges="developerBadges"
            :total-resources="totalContribResources"
            @open-developer="openDeveloperProfile"
          />
          <TeamRankCard
            v-if="teamRanks.length > 0"
            :ranks="teamRanks"
            @open-team="openTeamProfile"
          />
        </aside>
      </div>
    </div>

    <AuthModal
      :visible="authVisible"
      :authMode="routeAuthMode"
      :authTitle="authTitle"
      v-model:authUsername="authUsername"
      v-model:authPassword="authPassword"
      v-model:authEmail="authEmail"
      v-model:authEmailCode="authEmailCode"
      v-model:authInviteCode="authInviteCode"
      v-model:turnstileToken="authTurnstileToken"
      v-model:acceptTerms="acceptTerms"
      :authLoading="auth.loading"
      :loginRequiresTwoFactor="loginRequiresTwoFactor"
      :githubLoginLoading="githubLoading"
      :wechatLoginLoading="wechatLoginLoading"
      :qqLoginLoading="qqLoginLoading"
      :giteeLoginLoading="giteeLoading"
      :githubLoginAvailable="githubAvailable"
      :wechatLoginAvailable="wechatAvailable"
      :qqLoginAvailable="qqAvailable"
      :giteeLoginAvailable="giteeAvailable"
      :sendCodeLoading="sendCodeLoading"
      :sendCodeCountdown="sendCodeCountdown"
      @close="closeAuth"
      @submit="submitAuth"
      @loginWithGithub="loginWithGithub"
      @loginWithWechat="loginWithWechat"
      @loginWithQq="loginWithQq"
      @loginWithGitee="loginWithGitee"
      @sendAuthCode="sendAuthCode"
      @change-mode="openAuth"
    />

    <WechatLoginQrModal
      :visible="wechatQrLogin.visible"
      :url="wechatQrLogin.url"
      :state="wechatQrLogin.state"
      :poll-secret="wechatQrLogin.pollSecret"
      @close="closeWechatQrLogin"
      @refresh="refreshWechatQrLogin"
      @logged-in="handleWechatQrToken"
    />

    <PublishModal
      ref="publishModalRef"
      :visible="publishVisible"
      v-model:publishTitle="publishTitle"
      v-model:publishDescription="publishDescription"
      v-model:publishBudget="publishBudget"
      v-model:publishAcceptance="publishAcceptance"
      v-model:publishPaymentMode="publishPaymentMode"
      v-model:publishDevelopmentCycleDays="publishDevelopmentCycleDays"
      :modalTitle="publishModalTitle"
      :submitText="publishModalSubmitText"
      :loadingText="publishModalLoadingText"
      :publishLoading="publishLoading"
      :draft-scope="
        activeResubmitRequirementId
          ? `edit-${activeResubmitRequirementId}`
          : auth.isAuthed
            ? auth.username
            : 'default'
      "
      @close="closePublishModal"
      @notify="notify"
      @submit="submitPublishRequirement"
    />

    <DepositModal
      v-if="depositVisible && depositRequirement"
      :visible="depositVisible"
      :depositRequirement="depositRequirement"
      :formattedBudget="formatMoney(depositRequirement.budget)"
      :paymentStageLabel="paymentStageLabel"
      :depositChannel="depositChannel"
      :amountCouponCode="amountCouponCode"
      :discountCouponCode="discountCouponCode"
      :isFinalPayment="isFinalPayment"
      :depositRatioPercent="depositRatioPercent"
      :couponSummary="couponSummary"
      :availableCoupons="availableCoupons"
      :couponLoading="couponLoading"
      :depositLoading="depositLoading"
      :depositPayment="depositPayment"
      :couponFinalAmount="couponFinalAmount"
      :isEscrowPayment="depositRequirement.paymentMode === 'platform_guarantee'"
      :depositPolicyAccepted="depositPolicyAccepted"
      :contractSigningStatus="contractSigningStatus"
      @close="closeDepositCard"
      @submit="submitDepositPayment"
      @update:depositPolicyAccepted="depositPolicyAccepted = $event"
      @update:depositChannel="updateDepositChannel"
      @selectCoupon="selectCoupon"
      @loadAvailableCoupons="loadAvailableCoupons"
    />
  </main>
</template>
