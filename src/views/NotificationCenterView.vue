<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useRoute, useRouter } from 'vue-router'
import { listCommunityPosts, listMyCommentWarnings, type CommentWarning, type CommunityPost } from '@/api/community'
import { listMyAfterSalesCases, type AfterSalesCase } from '@/api/afterSales'
import {
  listConversationHistoryDisclosures,
  respondConversationHistoryDisclosure,
  type ConversationHistoryDisclosure,
} from '@/api/conversations'
import {
  acceptResourceTransfer,
  cancelResourceTransfer,
  listMyResourceTransferInbox,
  listMyResourceTransfers,
  rejectResourceTransfer,
  type ResourceTransferPayload,
} from '@/api/resourceTransfers'
import { LIST_PAGE_SIZES, useClientPagination } from '@/composables/useClientPagination'
import {
  NOTIFICATION_KIND_LABELS,
  buildNotificationCards,
  countByKind,
  filterNotificationCards,
  pendingActionCount,
  type NotificationCard,
  type NotificationKind,
} from '@/shared/notifications'
import { describeTransferError } from '@/shared/resourceTransfer'
import { useAuthStore } from '@/stores/auth'


import {
  TButton,
  TIcon,
  TInput,
  TMessage,
  TOption,
  TPagination,
  TSelect,
  Bell,
  ChatDotRound,
  Clock,
  Promotion,
  Refresh,
  RefreshLeft,
  Search,
  Service,
  Switch,
  Warning,
} from 'ui_73info'

/* 「系统通知」：评论警告、历史沟通公开申请、解除合作案件、平台公告四类系统消息，统一成同一种消息卡片。
   三类数据要登录（评论警告、公开申请、解除合作案件），公告是公开接口，所以四支请求并行发、各自结算：
   某一支挂了只提示那一类，其余照常显示——一类接口抖动不该让整页变空。

   两个工作台共用这一页（用户端 workbench-notifications / 开发者端 dev-notifications），
   与消息中心、工单中心同一办法：页面根元素与各构件按 isDevWorkbench 在两套统一层之间切，
   不写「近似」对方的覆盖样式。 */

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const isDevWorkbench = computed(() => route.matched.some((record) => Boolean(record.meta.devArea)))

/** 平台公告一次取回的上限：公告卡只做告知，翻十几页公告没有意义，取最近一批即可。 */
const ANNOUNCEMENT_LIMIT = 50

const loading = ref(false)
const warnings = ref<CommentWarning[]>([])
const disclosures = ref<ConversationHistoryDisclosure[]>([])
const afterSales = ref<AfterSalesCase[]>([])
const announcements = ref<CommunityPost[]>([])
const transferInbox = ref<ResourceTransferPayload[]>([])
const myTransfers = ref<ResourceTransferPayload[]>([])
const warningError = ref('')
const kindFilter = ref<'all' | NotificationKind>('all')
const keyword = ref('')
const votingId = ref<number | null>(null)
/** 正在处理（同意 / 拒绝 / 撤销）的过户申请 id，用于给对应按钮显示 loading。 */
const respondingTransferId = ref<number | null>(null)

const kindFilters = computed<Array<{ value: 'all' | NotificationKind; label: string; count: number }>>(() => {
  const counts = countByKind(cards.value)
  return [
    { value: 'all' as const, label: '全部', count: cards.value.length },
    { value: 'comment-warning' as const, label: NOTIFICATION_KIND_LABELS['comment-warning'], count: counts['comment-warning'] },
    { value: 'history-disclosure' as const, label: NOTIFICATION_KIND_LABELS['history-disclosure'], count: counts['history-disclosure'] },
    { value: 'resource-transfer' as const, label: NOTIFICATION_KIND_LABELS['resource-transfer'], count: counts['resource-transfer'] },
    { value: 'after-sales' as const, label: NOTIFICATION_KIND_LABELS['after-sales'], count: counts['after-sales'] },
    { value: 'announcement' as const, label: NOTIFICATION_KIND_LABELS.announcement, count: counts.announcement },
  ].filter((option) => option.value !== 'resource-transfer' || isDevWorkbench.value)
})

const cards = computed<NotificationCard[]>(() =>
  buildNotificationCards({
    warnings: warnings.value,
    disclosures: disclosures.value,
    afterSales: afterSales.value,
    announcements: announcements.value,
    transferInbox: isDevWorkbench.value ? transferInbox.value : [],
    myTransfers: isDevWorkbench.value ? myTransfers.value : [],
    username: auth.username,
  }),
)

const filteredCards = computed(() => filterNotificationCards(cards.value, kindFilter.value, keyword.value))
const pendingActions = computed(() => pendingActionCount(cards.value))
const filtersActive = computed(() => keyword.value.trim() !== '' || kindFilter.value !== 'all')

/* 三类各是一次全量取回（评论警告与公开申请都不分页，公告取上限 50 条），
   所以筛选与分页都在前端做（与我的收藏、我的合同同一套页码口径）。 */
const {
  page,
  pageSize,
  total: filteredTotal,
  paged: pagedCards,
  resetPage,
} = useClientPagination(filteredCards)

// 筛选条件一变就回到第 1 页，否则从第 3 页开始筛会直接看到一张空列表。
watch([kindFilter, keyword], resetPage)

/* 展示顺序像会话：分页仍按「最新在前」切（第 1 页就是最近的一批），页内倒过来排，
   最新一条落在列表最底部，并把视口滚到底，打开就看到最新的通知。 */
const displayCards = computed(() => [...pagedCards.value].reverse())

async function scrollToLatest() {
  await nextTick()
  const wrap = document.querySelector<HTMLElement>('.app-scrollbar .t73-scrollbar__wrap')
  if (wrap) {
    wrap.scrollTop = wrap.scrollHeight
    return
  }
  window.scrollTo({ top: document.documentElement.scrollHeight })
}

watch(page, () => void scrollToLatest())

function resetFilters() {
  kindFilter.value = 'all'
  keyword.value = ''
}

async function loadNotifications(showSuccess = false) {
  auth.hydrate()
  if (!auth.token.trim()) {
    warnings.value = []
    disclosures.value = []
    afterSales.value = []
    transferInbox.value = []
    myTransfers.value = []
  }

  loading.value = true
  warningError.value = ''
  // 公告是公开接口，未登录也能取；另几支需要令牌，未登录时直接跳过，避免明知会 401 还发一次。
  const authed = Boolean(auth.token.trim())
  // 过户只在开发者工作台出现，与主请求并行拉，失败只提示这一类，不影响其余通知。
  const transfersTask = isDevWorkbench.value ? loadTransfers() : Promise.resolve()
  const [warningsResult, disclosuresResult, afterSalesResult, announcementsResult] =
    await Promise.allSettled([
      authed ? listMyCommentWarnings(auth.token) : Promise.resolve<CommentWarning[]>([]),
      authed ? listConversationHistoryDisclosures(auth.token) : Promise.resolve<ConversationHistoryDisclosure[]>([]),
      // 案件列表接口回的是分页包（items + 解除合作窗口状态），这里只要案件本身。
      authed
        ? listMyAfterSalesCases(auth.token).then((page) => page.items)
        : Promise.resolve<AfterSalesCase[]>([]),
      listCommunityPosts({ tag: '公告', limit: ANNOUNCEMENT_LIMIT, offset: 0 }),
    ])

  if (warningsResult.status === 'fulfilled') {
    warnings.value = warningsResult.value
  } else {
    warningError.value = warningsResult.reason instanceof Error ? warningsResult.reason.message : '加载评论警告失败'
  }

  if (disclosuresResult.status === 'fulfilled') {
    disclosures.value = disclosuresResult.value
  } else {
    TMessage.error(
      disclosuresResult.reason instanceof Error ? disclosuresResult.reason.message : '加载公开申请失败',
    )
  }

  if (afterSalesResult.status === 'fulfilled') {
    afterSales.value = afterSalesResult.value
  } else {
    TMessage.error(
      afterSalesResult.reason instanceof Error ? afterSalesResult.reason.message : '加载解除合作案件失败',
    )
  }

  if (announcementsResult.status === 'fulfilled') {
    // 只认已发布的公告：待审核/被驳回的帖子不该出现在用户的通知里。
    announcements.value = announcementsResult.value.filter((post) => post.status === 'published')
  } else {
    TMessage.error(
      announcementsResult.reason instanceof Error ? announcementsResult.reason.message : '加载平台公告失败',
    )
  }

  await transfersTask
  loading.value = false
  if (showSuccess) {
    TMessage.success('系统通知已刷新')
  }
}

/** 投票后只重拉公开申请那一支：另几类不会因为这一票而变化。 */
async function loadDisclosures() {
  if (!auth.token.trim()) return
  try {
    disclosures.value = await listConversationHistoryDisclosures(auth.token)
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '加载公开申请失败')
  }
}

/** 拉取「待我同意」与「我发起的」两份过户列表。 */
async function loadTransfers() {
  if (!auth.token.trim() || !isDevWorkbench.value) return
  try {
    const [inbox, mine] = await Promise.all([
      listMyResourceTransferInbox(auth.token),
      listMyResourceTransfers(auth.token),
    ])
    transferInbox.value = inbox
    myTransfers.value = mine
  } catch (error) {
    const { message } = describeTransferError(error, '加载资源过户失败')
    TMessage.warning(message)
  }
}

/** 接收方同意 / 拒绝。同意后资源换主，刷新列表让卡片状态跟上。 */
async function respondTransfer(card: NotificationCard, accepted: boolean) {
  if (!auth.token.trim() || card.transferId == null || respondingTransferId.value !== null) {
    return
  }

  const resourceName = card.transferResourceName || '该资源'
  if (accepted) {
    const confirmed = window.confirm(
      `同意接收资源「${resourceName}」吗？同意后该资源归你所有，原所有者将不再拥有它。`,
    )
    if (!confirmed) {
      return
    }
  }

  respondingTransferId.value = card.transferId
  try {
    if (accepted) {
      await acceptResourceTransfer(auth.token, card.transferId)
    } else {
      await rejectResourceTransfer(auth.token, card.transferId)
    }
    TMessage.success(accepted ? '已同意过户，资源已转入你的资源项目' : '已拒绝该过户申请')
  } catch (error) {
    const { message, needRefresh } = describeTransferError(
      error,
      accepted ? '同意过户失败' : '拒绝过户失败',
    )
    TMessage.error(message)
    if (!needRefresh) {
      return
    }
  } finally {
    respondingTransferId.value = null
  }
  await loadTransfers()
}

/** 发起方撤销待处理的过户申请。 */
async function cancelTransfer(card: NotificationCard) {
  if (!auth.token.trim() || card.transferId == null || respondingTransferId.value !== null) {
    return
  }

  respondingTransferId.value = card.transferId
  try {
    await cancelResourceTransfer(auth.token, card.transferId)
    TMessage.success('过户申请已撤销，资源归属保持不变')
  } catch (error) {
    const { message, needRefresh } = describeTransferError(error, '撤销过户失败')
    TMessage.error(message)
    if (!needRefresh) {
      return
    }
  } finally {
    respondingTransferId.value = null
  }
  await loadTransfers()
}

async function vote(card: NotificationCard, decision: 'approved' | 'rejected') {
  if (!auth.token.trim() || card.disclosureId == null || votingId.value !== null) {
    return
  }

  votingId.value = card.disclosureId
  try {
    await respondConversationHistoryDisclosure(auth.token, card.disclosureId, decision)
    TMessage.success(decision === 'approved' ? '已同意公开这段历史沟通' : '已拒绝公开这段历史沟通')
    await loadDisclosures()
  } catch (error) {
    TMessage.warning(error instanceof Error ? error.message : '提交表决失败')
  } finally {
    votingId.value = null
  }
}

/** 公告卡片整块可点：进社区帖详情。 */
function openAnnouncement(card: NotificationCard) {
  if (card.postId == null) return
  void router.push({ name: 'community-post', params: { postId: card.postId } })
}

/** 每个类别一个图标，配色由卡片的 --notifications-accent 决定。 */
function kindIcon(kind: NotificationKind) {
  switch (kind) {
    case 'comment-warning':
      return Warning
    case 'history-disclosure':
      return ChatDotRound
    case 'resource-transfer':
      return Switch
    case 'after-sales':
      return Service
    case 'announcement':
      return Promotion
  }
}

function emptyTitle() {
  if (keyword.value.trim()) {
    return '没有匹配的系统通知'
  }
  if (kindFilter.value !== 'all') {
    return `暂无${NOTIFICATION_KIND_LABELS[kindFilter.value]}`
  }
  return '暂无系统通知'
}

onMounted(async () => {
  await loadNotifications()
  await scrollToLatest()
})
</script>

<template>
  <main :class="isDevWorkbench ? 'dev-page notifications-page' : 'page-shell custom-page-shell profile-page notifications-page'"
    :aria-busy="loading">
    <!-- 顶部读数条：两端共用用户工作台这一层（.wb-strip），开发者侧第三格换成「资源过户」 -->
    <WorkbenchBarSlot>
      <section class="wb-strip" aria-label="系统通知概览">
        <div class="wb-strip__item">
          <span class="wb-strip__label">全部通知</span>
          <span class="wb-strip__value">{{ loading && !cards.length ? '—' : cards.length }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">待我处理</span>
          <span class="wb-strip__value">{{ pendingActions }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div v-if="isDevWorkbench" class="wb-strip__item">
          <span class="wb-strip__label">资源过户</span>
          <span class="wb-strip__value">{{ countByKind(cards)['resource-transfer'] }}</span>
        </div>
        <div v-else class="wb-strip__item">
          <span class="wb-strip__label">评论警告</span>
          <span class="wb-strip__value">{{ countByKind(cards)['comment-warning'] }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">平台公告</span>
          <span class="wb-strip__value">{{ countByKind(cards).announcement }}</span>
        </div>
        <div class="wb-strip__item wb-strip__action">
          <TButton icon-only aria-label="刷新系统通知" title="刷新系统通知" :loading="loading"
            @click="loadNotifications(true)">
            <TIcon>
              <Refresh />
            </TIcon>
          </TButton>
        </div>
      </section>
    </WorkbenchBarSlot>

    <section class="wallet-section notifications-panel">
      <div class="wb-card-head">
        <div class="wb-card-head__title-block">
          <h3 class="wb-card-head__title">系统通知</h3>
        </div>
        <div v-if="pendingActions" class="wb-card-head__actions">
          <span class="notifications-pending">
            <TIcon :icon="Bell" />
            待我处理 {{ pendingActions }}
          </span>
        </div>
      </div>

      <div v-if="warningError" class="notifications-warning" role="alert">
        <span>评论警告加载失败：{{ warningError }}</span>
        <TButton variant="outline" @click="loadNotifications()">重试</TButton>
      </div>

      <div v-if="cards.length || filtersActive" class="wb-toolbar">
        <div class="wb-chip-group" role="group" aria-label="通知类别">
          <button v-for="option in kindFilters" :key="option.value" type="button" class="wb-chip wb-chip--button"
            :class="{ 'is-active': kindFilter === option.value, 'wb-chip--muted': option.value === 'announcement' }"
            :aria-pressed="kindFilter === option.value" @click="kindFilter = option.value">
            {{ option.label }}<span class="wb-chip__count">{{ option.count }}</span>
          </button>
        </div>
        <TInput v-model="keyword" class="wb-toolbar__search" clearable placeholder="搜索标题或内容"
          aria-label="搜索系统通知">
          <template #prefix>
            <TIcon>
              <Search />
            </TIcon>
          </template>
        </TInput>
        <div class="wb-toolbar__actions">
          <span class="wb-toolbar__hint">
            {{ filtersActive ? `筛选出 ${filteredTotal} / ${cards.length} 条` : `共 ${cards.length} 条` }}
          </span>
          <TButton variant="outline" v-if="filtersActive" @click="resetFilters">
            <TIcon>
              <RefreshLeft />
            </TIcon>
            <span>重置</span>
          </TButton>
        </div>
      </div>

      <p v-if="loading && !cards.length" class="wb-empty" role="status">系统通知加载中…</p>
      <div v-else-if="!filteredCards.length" class="wb-empty notifications-empty">
        <span class="notifications-empty__icon">
          <TIcon :icon="Bell" />
        </span>
        <span class="wb-empty__title notifications-empty__title">{{ emptyTitle() }}</span>
        <p v-if="filtersActive" class="notifications-empty__hint">换个关键词，或清空筛选查看全部通知。</p>
        <div v-if="filtersActive" class="wb-empty__actions notifications-empty__actions">
          <TButton variant="outline" @click="resetFilters">
            <TIcon>
              <RefreshLeft />
            </TIcon>
            <span>清空筛选</span>
          </TButton>
        </div>
      </div>
      <template v-else>
        <ul class="wb-list" aria-label="系统通知列表">
          <li v-for="card in displayCards" :key="card.key" class="wb-item notifications-card"
            :class="[`notifications-card--${card.kind}`, { 'wb-item--clickable': card.postId != null }]"
            :role="card.postId != null ? 'button' : undefined" :tabindex="card.postId != null ? 0 : undefined"
            @click="card.postId != null && openAnnouncement(card)"
            @keydown.enter.prevent="card.postId != null && openAnnouncement(card)">
            <span class="notifications-card__icon">
              <TIcon :icon="kindIcon(card.kind)" />
            </span>
            <div class="wb-item__main notifications-card__main">
              <div class="notifications-card__head">
                <strong class="wb-item__title">{{ card.title }}</strong>
                <span class="notifications-kind">{{ card.kindLabel }}</span>
              </div>
              <span v-for="(line, index) in card.body" :key="`body-${index}`"
                class="wb-item__meta notifications-card__line">
                {{ line }}
              </span>
              <span v-if="card.voteHint" class="wb-item__meta notifications-card__line">
                {{ card.voteHint }}
              </span>
            </div>
            <div class="wb-item__side">
              <span class="wb-item__meta notifications-card__meta">
                <TIcon :icon="Clock" />
                {{ card.meta }}
              </span>
              <div v-if="card.canVote" class="notifications-card__actions">
                <TButton variant="outline" :disabled="votingId !== null"
                  @click.stop="vote(card, 'rejected')">
                  拒绝
                </TButton>
                <TButton variant="solid" tone="accent" :disabled="votingId !== null"
                  @click.stop="vote(card, 'approved')">
                  同意公开
                </TButton>
              </div>
              <div v-else-if="card.transferAction === 'respond'" class="notifications-card__actions">
                <TButton variant="outline" :disabled="respondingTransferId !== null"
                  @click.stop="respondTransfer(card, false)">
                  拒绝
                </TButton>
                <TButton variant="solid" tone="accent" :disabled="respondingTransferId !== null"
                  @click.stop="respondTransfer(card, true)">
                  同意接收
                </TButton>
              </div>
              <TButton v-else-if="card.transferAction === 'cancel'" variant="outline"
                :disabled="respondingTransferId !== null" @click.stop="cancelTransfer(card)">
                撤销申请
              </TButton>
              <TButton variant="outline" v-else-if="card.postId != null"
                @click.stop="openAnnouncement(card)">
                查看公告
              </TButton>
            </div>
          </li>
        </ul>
        <div class="wb-pager">
          <div class="wb-pager__count">
            <TSelect v-model="pageSize" class="wb-pager__size" aria-label="每页条数">
              <TOption v-for="size in LIST_PAGE_SIZES" :key="size" :label="`${size} 条/页`" :value="size" />
            </TSelect>
          </div>
          <TPagination v-model:current-page="page" :page-size="pageSize" :total="filteredTotal"
            :pager-count="5" background aria-label="系统通知分页" />
        </div>
      </template>
    </section>
  </main>
</template>

<style scoped>
/* 版式主体走统一层（.dev-* / .wb-*），本页只补通知卡片自己的层级：
   类别色条 + 图标底、类别徽标、时间行与动作区。 */

.notifications-page {
  align-content: start;
}

/* ==== 通知卡片 ==== */
.notifications-card {
  --notifications-accent: #64748b;
  position: relative;
  align-items: flex-start;
  overflow: hidden;
  padding-left: 22px;
  transition: border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
}

/* 左侧 3px 类别色条：不增加一列布局，只做视觉锚点，扫列表时先按颜色分出类别 */
.notifications-card::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--notifications-accent);
  opacity: 0.8;
}

.notifications-card--comment-warning {
  --notifications-accent: #d97706;
}

.notifications-card--history-disclosure {
  --notifications-accent: #1f4ad1;
}

.notifications-card--resource-transfer {
  --notifications-accent: #0f766e;
}

.notifications-card--after-sales {
  --notifications-accent: #dc2626;
}

.notifications-card--announcement {
  --notifications-accent: #7c3aed;
}

.notifications-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  border: 1px solid color-mix(in srgb, var(--notifications-accent) 16%, transparent);
  border-radius: 11px;
  background: color-mix(in srgb, var(--notifications-accent) 9%, #ffffff);
  color: var(--notifications-accent);
  font-size: 18px;
}

/* 正文可能有两三行（公开申请有说明行 + 投票进度行），行与行贴紧一点 */
.notifications-card__main {
  display: grid;
  flex: 1 1 auto;
  gap: 5px;
  min-width: 0;
}

.notifications-card__head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

/* 类别徽标取卡片自己的类别色，与左侧图标、色条是同一支颜色 */
.notifications-kind {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 9px;
  border: 1px solid color-mix(in srgb, var(--notifications-accent) 20%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--notifications-accent) 8%, #ffffff);
  color: var(--notifications-accent);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}

.notifications-card__line {
  margin: 0;
  color: var(--profile-text-sub, #64748b);
  font-size: 13px;
  line-height: 1.65;
}

.notifications-card__line--hint {
  font-variant-numeric: tabular-nums;
}

.notifications-card__side {
  display: flex;
  align-items: flex-end;
  flex-direction: column;
  flex: 0 0 auto;
  gap: 10px;
  min-width: 124px;
  text-align: right;
}

/* 时间行：小号灰字 + 时钟图标，不再跟正文抢视觉重量 */
.notifications-card__meta {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  margin-top: 0;
  color: var(--profile-text-sub, #64748b);
  font-size: 12px;
  line-height: 1.5;
}

.notifications-card__actions {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

/* 公告卡片整块可点：悬停给出反馈，键盘焦点环不能被 hover 盖掉 */
.notifications-card--clickable {
  cursor: pointer;
}

.notifications-card--clickable:hover {
  border-color: color-mix(in srgb, var(--notifications-accent) 34%, #e2e8f0);
  background: color-mix(in srgb, var(--notifications-accent) 4%, #ffffff);
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.07);
}

.notifications-card--clickable:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--notifications-accent) 45%, transparent);
  outline-offset: 2px;
}

/* 卡头右侧的「待我处理」计数：与读数条呼应，提醒这一页有动作要做 */
.notifications-pending {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 11px;
  border: 1px solid rgba(217, 119, 6, 0.2);
  border-radius: 999px;
  background: rgba(217, 119, 6, 0.09);
  color: #b45309;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

/* ==== 空态 ==== */
.notifications-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 24px;
}

.notifications-empty__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  margin-bottom: 2px;
  border-radius: 50%;
  background: rgba(148, 163, 184, 0.12);
  color: #94a3b8;
  font-size: 21px;
}

.notifications-empty__title {
  color: inherit;
}

.notifications-empty__hint {
  margin: 0;
  color: var(--profile-text-sub, #94a3b8);
  font-size: 12px;
  line-height: 1.6;
}

.notifications-empty__actions {
  margin-top: 4px;
}

/* 评论警告拉取失败时的提示条：只提示这一类，其余通知照常显示 */
.notifications-warning {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--dev-gold) 32%, transparent);
  border-radius: var(--wb-radius-item);
  background: color-mix(in srgb, var(--dev-gold) 10%, transparent);
  color: var(--profile-warning-text, #92400e);
  font-size: 13px;
}

/* 窄屏不展示类别胶囊：各类数量已在顶栏读数条里，列表只留搜索。
   列表像会话一样贴底：面板撑满顶栏以下的一屏，搜索留在上方，通知压到底部，最新一条最靠近底边 */
@media (max-width: 900px) {
  .wb-chip-group {
    display: none;
  }

  .notifications-panel {
    display: flex;
    flex-direction: column;
    /* 扣掉顶栏以上 73px，以及底部给快捷导航让出的 80px + 内容区下内边距 22px（见 App.vue），
       一屏放得下时外层不出滚动，搜索框不会被滚出去 */
    min-height: calc(100dvh - 73px - 102px);
  }

  .notifications-panel > .wb-list,
  .notifications-panel > .wb-empty {
    margin-top: auto;
  }
}

@media (max-width: 640px) {
  /* 触屏档：图标与正文一行，时间与动作落到下一行；按钮平分整行，触摸目标 ≥44px */
  .notifications-card {
    flex-wrap: wrap;
    padding-left: 20px;
  }

  .notifications-card__side {
    align-items: stretch;
    width: 100%;
    /* 与正文左缘对齐：38px 图标 + 10px 间距 */
    padding-left: 48px;
    text-align: left;
  }

  .notifications-card__meta {
    justify-content: flex-start;
  }

  .notifications-card__actions :deep(.t73-button) {
    flex: 1;
    min-height: 44px;
  }

  .notifications-pending {
    display: none;
  }
}
</style>
