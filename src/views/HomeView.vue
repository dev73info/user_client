<script setup lang="ts">
import '@/styles/home.css'

import { computed } from 'vue'

import { useAuthStore } from '@/stores/auth'
import AuthModal from '@/components/AuthModal.vue'
import WechatLoginQrModal from '@/components/WechatLoginQrModal.vue'
import PublishModal from '@/components/PublishModal.vue'
import DepositModal from '@/components/DepositModal.vue'
import PortalHeroSection from '@/components/home/PortalHeroSection.vue'
import PortalQuickPanels from '@/components/home/PortalQuickPanels.vue'
import PortalSidebarColumn from '@/components/home/PortalSidebarColumn.vue'
import PortalWorkflowSection from '@/components/home/PortalWorkflowSection.vue'
import SpotlightResourceSection from '@/components/home/SpotlightResourceSection.vue'
import { useHomeAuthQuery } from '@/composables/useHomeAuthQuery'
import { useHomeCheckin } from '@/composables/useHomeCheckin'
import { useHomeDepositCard } from '@/composables/useHomeDepositCard'
import { useHomePortalActions } from '@/composables/useHomePortalActions'
import { useHomePortalAuth } from '@/composables/useHomePortalAuth'
import {
  useHomePortalLoaders,
  type PendingRequirementView,
} from '@/composables/useHomePortalLoaders'
import { useHomePortalLifecycle } from '@/composables/useHomePortalLifecycle'
import { useHomePublishCard } from '@/composables/useHomePublishCard'
import { usePortalRanks } from '@/composables/usePortalRanks'
import { usePublicResources } from '@/composables/usePublicResources'
import {
  buildMilestoneStats,
  buildPortalNotices,
  type PortalMilestoneStat,
  type PortalNotice,
} from '@/shared/home/portalDisplay'
import {
  HOME_HERO_SIGNALS,
  HOME_QUICK_PANELS,
  HOME_WORKFLOW_STEPS,
} from '@/shared/home/portalSections'

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

/** URL 取值口径只有这一份：弹窗开关、`redirect_to`、邀请码、分享参数共用。 */
const { routeQueryValue, consumeAuthQuery } = useHomeAuthQuery({
  onUnionAuthorized: () => {
    markUnionAuthorized()
  },
})

/**
 * 支付域（卡片状态 / 支付方式 / 押金比例 / 券 / 拉起 Adapay 与回跳确认）在 `useDepositPayment`，
 * 首页这一层只接它的弹窗绑定与四个入口（`useHomeDepositCard`）。
 */
const {
  depositModalBindings,
  depositLoading,
  openDepositPayment,
  canOpenPayment,
  loadDepositRatio,
  markUnionAuthorized,
} = useHomeDepositCard({
  isMounted: () => isMounted,
  pendingRequirements,
  loadPendingRequirements: () => loadPendingRequirements(),
  routeQueryValue,
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

/**
 * 首屏、登录态变化、5 分钟轮询与卸载清理整块在 `useHomePortalLifecycle`：视图只交出四路 loader、
 * 签到、授权回跳参数的消费与三个「有写在途就不轮询」的标记，顺手拿回登录成功后要跑的
 * `refreshPortalData`（与首屏那一份是同一个函数，不另立第二份口径）。
 */
const { refreshPortalData } = useHomePortalLifecycle({
  markUnmounted: () => {
    isMounted = false
  },
  loadCheckin: loadHomeCheckin,
  consumeAuthQuery,
  loadDepositRatio,
  loadPendingRequirements,
  loadRequirementOverview,
  loadPublicPortalData,
  isBusy: () => depositLoading.value || publishLoading.value,
})

/** 登录 / 微信扫码两个弹窗：表单状态在 `useAuthForm`，路由参数与收尾在 `useHomePortalAuth`。 */
const { openAuth, authModalBindings, wechatQrBindings } = useHomePortalAuth({
  routeQueryValue,
  refreshPortalData,
})

/**
 * 发布域（表单状态 / 实名门禁 / 校验 / `POST` 与 `PATCH` 提交）在 `useRequirementPublish`；
 * 首页这一层只接弹窗绑定、`openPublishModal` 与「驳回 → 重新编辑」的 `startResubmit`。
 */
const { publishModalBindings, publishModalRef, publishLoading, openPublishModal, startResubmit } =
  useHomePublishCard({
    isMounted: () => isMounted,
    openAuth: (mode, redirectTo) => openAuth(mode, redirectTo),
    loadPendingRequirements: () => loadPendingRequirements(),
    routeQueryValue,
  })

const isDeveloperAccount = computed(() => auth.role === 'dev' || auth.role === 'super_admin')
const devActionLabel = computed(() => (isDeveloperAccount.value ? '我要接单' : '成为开发者'))

const heroSignals = HOME_HERO_SIGNALS
const quickPanels = HOME_QUICK_PANELS
const workflowSteps = HOME_WORKFLOW_STEPS

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

/** 首页所有跳转与精选卡点赞的接线（`useHomePortalActions`）。 */
const portalActions = useHomePortalActions({
  isDeveloperAccount,
  publicResources,
  pendingRequirements,
  resolveResourceRoute,
  applyLikeState,
  canOpenPayment,
  openDepositCard,
  openAuth,
  openPublishModal,
})

/** 精选卡片的点赞提交态是 ref，模板里要自动解包，故在 setup 顶层留一份引用。 */
const spotlightLikeSubmittingIds = portalActions.spotlightLikeSubmittingIds

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

const platformStats = computed<PortalMilestoneStat[]>(() =>
  buildMilestoneStats({
    developerCount: publicDeveloperCount.value,
    resourceCount: publicResources.value.length,
    completedLabel: metrics.value[0]?.value,
  }),
)
</script>

<template>
  <main id="top" class="portal-home">
    <div class="portal-shell">
      <div class="portal-layout">
        <div class="portal-main">
          <PortalHeroSection
            :signals="heroSignals"
            :is-developer-account="isDeveloperAccount"
            :dev-action-label="devActionLabel"
            @publish="portalActions.openPrimaryPublishAction"
            @dev-workbench="portalActions.openDevWorkbench"
            @free-resources="portalActions.openFreeResources"
            @community="portalActions.openCommunity"
          />

          <PortalQuickPanels :panels="quickPanels" @open="portalActions.openQuickPanel" />

          <PortalWorkflowSection :steps="workflowSteps" @open="portalActions.openWorkflowStep" />

          <!-- 精选资源区（卡片映射 / 分页 / 跑马灯 / 点赞回抛）在 components/home/SpotlightResourceSection.vue -->
          <SpotlightResourceSection
            :resources="publicResources"
            :high-like-threshold="highLikeThreshold"
            :like-submitting-ids="spotlightLikeSubmittingIds"
            @open="portalActions.openSpotlight"
            @like="portalActions.toggleSpotlightLike"
            @more="portalActions.openFreeResources"
          />
        </div>

        <PortalSidebarColumn
          :is-authed="auth.isAuthed"
          :checkin="homeCheckinStatus"
          :checkin-saving="checkinHomeSaving"
          :notices="portalNotices"
          :stats="platformStats"
          :is-developer-account="isDeveloperAccount"
          :developer-ranks="developerRanks"
          :developer-badges="developerBadges"
          :total-contrib-resources="totalContribResources"
          :team-ranks="teamRanks"
          @checkin="handleHomeCheckin"
          @open-group="portalActions.openBetaGroup"
          @open-notice="portalActions.openPortalNotice"
          @more-notices="portalActions.openCommunity"
          @open-resource-init="portalActions.openResourceInit"
          @open-developer="portalActions.openDeveloperProfile"
          @open-team="portalActions.openTeamProfile"
        />
      </div>
    </div>

    <AuthModal v-bind="authModalBindings" />

    <WechatLoginQrModal v-bind="wechatQrBindings" />

    <PublishModal ref="publishModalRef" v-bind="publishModalBindings" />

    <DepositModal v-if="depositModalBindings" v-bind="depositModalBindings" />
  </main>
</template>
