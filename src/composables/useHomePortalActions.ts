import { ref, type Ref } from 'vue'
import { useRouter } from 'vue-router'

import { TMessage } from 'ui_73info'

import type { PublicMcResourceItem } from '@/api/resources'
import { HttpError } from '@/api/http'
import { likePublicMcResource, unlikePublicMcResource } from '@/api/resources'
import type { ResourceRouteSlugs } from './usePublicResources'
import type { DepositRequirement } from './useDepositPayment'
import type { PendingRequirementView } from './useHomePortalLoaders'
import type { AuthMode } from './useRequirementPublish'
import type { PortalNotice } from '@/shared/home/portalDisplay'
import type { PortalQuickPanel, PortalWorkflowStep } from '@/shared/home/portalSections'
import type { SpotlightCard } from '@/composables/useSpotlightCards'
import { resourceDetailLocation, resourceListingSaleOf } from '@/shared/resourceNavigation'
import { useAuthStore } from '@/stores/auth'
import { buildDevPortalUrl } from '@/config/runtime'

export type HomePortalActionsOptions = {
  isDeveloperAccount: Ref<boolean>
  /** 公开资源那一份状态（`usePublicResources`） */
  publicResources: Ref<PublicMcResourceItem[]>
  /** 待办需求（精选卡片里「按标题找人」这一支要用） */
  pendingRequirements: Ref<PendingRequirementView[]>
  resolveResourceRoute: (resource: PublicMcResourceItem) => ResourceRouteSlugs | null
  /** 点赞回写（含列表缓存失效）在 `usePublicResources`，视图不自己拼那一份状态。 */
  applyLikeState: (resourceId: number, state: { liked_by_me: boolean; like_count: number }) => void
  /** 支付域：这张需求点得开支付卡片吗 */
  canOpenPayment: (item: DepositRequirement) => boolean
  /** 列表行 / 精选卡片的统一入口（视图顶层那一份） */
  openDepositCard: (item: PendingRequirementView) => void
  openAuth: (mode: AuthMode) => void
  openPublishModal: () => Promise<void>
}

/** 「加入内测 QQ 群」的目标地址：只在这里出现一次。 */
const QQ_BETA_GROUP_URL = 'https://qm.qq.com/q/AXb3VBPurC'

/**
 * 首页所有跳转与「精选卡点赞」的接线（R047 从 `views/HomeView.vue` 拆出）。
 *
 * 视图只负责把状态与几个入口函数传进来；这里不持有任何数据源：
 * - 主视觉两颗按钮、入口宫格、快捷卡、定制流程五步、公告条、两张榜单的跳转；
 * - 精选卡片的 `open`（资源走详情路由，需求走支付卡片，其余提示进大厅）；
 * - 精选卡片的点赞（请求、登录门禁与 toast 都在这里，子组件不碰 token）。
 *
 * 冒泡已在 `SpotlightResourceSection` 里用 `@click.stop` 挡掉：那一下不能同时触发卡片 `open`，
 * 所以 `toggleSpotlightLike` **不再**接 DOM 事件 —— 传进来的只有卡片本身。
 */
export function useHomePortalActions(options: HomePortalActionsOptions) {
  const auth = useAuthStore()
  const router = useRouter()

  function openBetaGroup() {
    window.open(QQ_BETA_GROUP_URL, '_blank', 'noopener,noreferrer')
  }

  function openDeveloperProfile(username: string) {
    void router.push({ name: 'dev-profile', params: { username } })
  }

  function openTeamProfile(teamId: number) {
    void router.push({ name: 'team-profile', params: { teamId } })
  }

  function openFreeResources() {
    void router.push({ name: 'resources', query: { sale: 'free' } })
  }

  function openCommunity() {
    void router.push({ name: 'community' })
  }

  async function openDevWorkbench() {
    if (options.isDeveloperAccount.value) {
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

  function openQuickPanel(panel: PortalQuickPanel) {
    if (panel.tone === 'gift') {
      void router.push({ name: 'resources', query: { sale: 'free' } })
      return
    }

    // briefcase（社区交流）：跳转到社区页面。
    void router.push({ name: 'community' })
  }

  function openWorkflowStep(step: PortalWorkflowStep) {
    if (step.action === 'publish') {
      void options.openPublishModal()
      return
    }

    if (step.action === 'developer') {
      openDevWorkbench()
      return
    }

    if (!auth.isAuthed) {
      TMessage.info('登录后可查看需求进度')
      options.openAuth('login')
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
      const target = options.publicResources.value.find((item) => item.id === card.resourceId)
      if (!target) {
        TMessage.info('资源详情正在加载中')
        return
      }

      const routeParams = options.resolveResourceRoute(target)
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

    const target = options.pendingRequirements.value.find((item) => item.title === card.title)
    if (target && options.canOpenPayment(target)) {
      options.openDepositCard(target)
      return
    }

    TMessage.info('请进入需求大厅查看需求')
  }

  function openPrimaryPublishAction() {
    if (options.isDeveloperAccount.value) {
      void router.push({ name: 'dev-plugins' })
      return
    }

    void options.openPublishModal()
  }

  /** 精选卡片的点赞提交态：只用于禁用重复点击，回写走 `applyLikeState`。 */
  const spotlightLikeSubmittingIds = ref<Set<number>>(new Set())

  function openSpotlightLikeLogin() {
    TMessage.info('请先登录后再点赞')
    options.openAuth('login')
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
      options.applyLikeState(resourceId, state)
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

  return {
    openBetaGroup,
    openDeveloperProfile,
    openTeamProfile,
    openFreeResources,
    openCommunity,
    openDevWorkbench,
    openResourceInit,
    openQuickPanel,
    openWorkflowStep,
    openPortalNotice,
    openSpotlight,
    openPrimaryPublishAction,
    spotlightLikeSubmittingIds,
    toggleSpotlightLike,
  }
}
