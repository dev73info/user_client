<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { listCommunityPosts, listMyCommentWarnings, type CommentWarning, type CommunityPost } from '@/api/community'
import { listMyAfterSalesCases, type AfterSalesCase } from '@/api/afterSales'
import {
  listConversationHistoryDisclosures,
  respondConversationHistoryDisclosure,
  type ConversationHistoryDisclosure,
} from '@/api/conversations'
import { LIST_PAGE_SIZES, useClientPagination } from '@/composables/useClientPagination'
import { useToast } from '@/composables/useToast'
import {
  NOTIFICATION_KIND_LABELS,
  buildNotificationCards,
  countByKind,
  filterNotificationCards,
  pendingVoteCount,
  type NotificationCard,
  type NotificationKind,
} from '@/shared/notifications'
import { useAuthStore } from '@/stores/auth'


import {
  TButton,
  TIcon,
  TInput,
  TOption,
  TPagination,
  TSelect,
  Refresh,
  RefreshLeft,
  Search,
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
const { showToast } = useToast()

const isDevWorkbench = computed(() => route.matched.some((record) => Boolean(record.meta.devArea)))

/** 平台公告一次取回的上限：公告卡只做告知，翻十几页公告没有意义，取最近一批即可。 */
const ANNOUNCEMENT_LIMIT = 50

const loading = ref(false)
const warnings = ref<CommentWarning[]>([])
const disclosures = ref<ConversationHistoryDisclosure[]>([])
const afterSales = ref<AfterSalesCase[]>([])
const announcements = ref<CommunityPost[]>([])
const warningError = ref('')
const kindFilter = ref<'all' | NotificationKind>('all')
const keyword = ref('')
const votingId = ref<number | null>(null)

const kindFilters = computed<Array<{ value: 'all' | NotificationKind; label: string; count: number }>>(() => {
  const counts = countByKind(cards.value)
  return [
    { value: 'all' as const, label: '全部', count: cards.value.length },
    { value: 'comment-warning' as const, label: NOTIFICATION_KIND_LABELS['comment-warning'], count: counts['comment-warning'] },
    { value: 'history-disclosure' as const, label: NOTIFICATION_KIND_LABELS['history-disclosure'], count: counts['history-disclosure'] },
    { value: 'after-sales' as const, label: NOTIFICATION_KIND_LABELS['after-sales'], count: counts['after-sales'] },
    { value: 'announcement' as const, label: NOTIFICATION_KIND_LABELS.announcement, count: counts.announcement },
  ]
})

const cards = computed<NotificationCard[]>(() =>
  buildNotificationCards({
    warnings: warnings.value,
    disclosures: disclosures.value,
    afterSales: afterSales.value,
    announcements: announcements.value,
    username: auth.username,
  }),
)

const filteredCards = computed(() => filterNotificationCards(cards.value, kindFilter.value, keyword.value))
const pendingVotes = computed(() => pendingVoteCount(cards.value))
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
  }

  loading.value = true
  warningError.value = ''
  // 公告是公开接口，未登录也能取；另三支需要令牌，未登录时直接跳过，避免明知会 401 还发一次。
  const authed = Boolean(auth.token.trim())
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
    showToast(
      disclosuresResult.reason instanceof Error ? disclosuresResult.reason.message : '加载公开申请失败',
      'error',
    )
  }

  if (afterSalesResult.status === 'fulfilled') {
    afterSales.value = afterSalesResult.value
  } else {
    showToast(
      afterSalesResult.reason instanceof Error ? afterSalesResult.reason.message : '加载解除合作案件失败',
      'error',
    )
  }

  if (announcementsResult.status === 'fulfilled') {
    // 只认已发布的公告：待审核/被驳回的帖子不该出现在用户的通知里。
    announcements.value = announcementsResult.value.filter((post) => post.status === 'published')
  } else {
    showToast(
      announcementsResult.reason instanceof Error ? announcementsResult.reason.message : '加载平台公告失败',
      'error',
    )
  }

  loading.value = false
  if (showSuccess) {
    showToast('系统通知已刷新', 'success')
  }
}

/** 投票后只重拉公开申请那一支：另两类不会因为这一票而变化。 */
async function loadDisclosures() {
  if (!auth.token.trim()) return
  try {
    disclosures.value = await listConversationHistoryDisclosures(auth.token)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '加载公开申请失败', 'error')
  }
}

async function vote(card: NotificationCard, decision: 'approved' | 'rejected') {
  if (!auth.token.trim() || card.disclosureId == null || votingId.value !== null) {
    return
  }

  votingId.value = card.disclosureId
  try {
    await respondConversationHistoryDisclosure(auth.token, card.disclosureId, decision)
    showToast(decision === 'approved' ? '已同意公开这段历史沟通' : '已拒绝公开这段历史沟通', 'success')
    await loadDisclosures()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '提交表决失败', 'warning')
  } finally {
    votingId.value = null
  }
}

/** 公告卡片整块可点：进社区帖详情。 */
function openAnnouncement(card: NotificationCard) {
  if (card.postId == null) return
  void router.push({ name: 'community-post', params: { postId: card.postId } })
}

/** 用户侧的类别徽标：警告=琥珀、公开申请=主色、公告=中性灰 */
function kindBadgeClass(kind: NotificationKind) {
  if (kind === 'comment-warning') return 'wb-badge wb-badge--warning'
  if (kind === 'history-disclosure') return 'wb-badge wb-badge--accent'
  return 'wb-badge'
}

/** 开发者侧的类别胶囊：与上面的档位一一对应 */
function kindChipClass(kind: NotificationKind) {
  if (kind === 'comment-warning') return 'dev-chip dev-chip--warm'
  if (kind === 'history-disclosure') return 'dev-chip'
  return 'dev-chip dev-chip--muted'
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

onMounted(() => {
  void loadNotifications()
})
</script>

<template>
  <main :class="isDevWorkbench ? 'dev-page notifications-page' : 'page-shell custom-page-shell profile-page notifications-page'"
    :aria-busy="loading">
    <!-- 顶部读数条：两侧各挂在各自的统一层上（开发者侧 .dev-meta-strip / 用户工作台侧 .wb-strip），
         读数在左、页面级刷新固定在最右的 __action 槽。 -->
    <section v-if="isDevWorkbench" class="dev-meta-strip" aria-label="系统通知概览">
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">全部通知</span>
        <span class="dev-meta-strip__value">{{ loading && !cards.length ? '—' : cards.length }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">待我确认</span>
        <span class="dev-meta-strip__value">{{ pendingVotes }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">评论警告</span>
        <span class="dev-meta-strip__value">{{ countByKind(cards)['comment-warning'] }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">平台公告</span>
        <span class="dev-meta-strip__value">{{ countByKind(cards).announcement }}</span>
      </div>
      <div class="dev-meta-strip__item dev-meta-strip__action">
        <TButton icon-only aria-label="刷新系统通知" title="刷新系统通知" :loading="loading"
          @click="loadNotifications(true)">
          <TIcon>
            <Refresh />
          </TIcon>
        </TButton>
      </div>
    </section>

    <section v-else class="wb-strip" aria-label="系统通知概览">
      <div class="wb-strip__item">
        <span class="wb-strip__label">全部通知</span>
        <span class="wb-strip__value">{{ loading && !cards.length ? '—' : cards.length }}</span>
      </div>
      <div class="wb-strip__divider" />
      <div class="wb-strip__item">
        <span class="wb-strip__label">待我确认</span>
        <span class="wb-strip__value">{{ pendingVotes }}</span>
      </div>
      <div class="wb-strip__divider" />
      <div class="wb-strip__item">
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

    <!-- 开发者工作台：提示条 + 内容卡，与其余菜单页同一形态（读数条 → 提示条 → 内容卡） -->
    <template v-if="isDevWorkbench">
      <div v-if="warningError" class="dev-notice">
        <span class="dev-notice__icon">!</span>
        <div class="dev-notice__copy">
          <strong>评论警告加载失败</strong>
          <p>{{ warningError }}</p>
        </div>
        <div class="dev-notice__action">
          <button class="dev-btn dev-btn--ghost" type="button" @click="loadNotifications()">重试</button>
        </div>
      </div>

      <section class="dev-surface-card">
        <div class="dev-card-head">
          <div class="dev-card-head__title-block">
            <h3 class="dev-section-title">系统通知</h3>
          </div>
        </div>

        <div class="dev-toolbar">
          <div class="dev-chip-group" role="group" aria-label="通知类别">
            <button v-for="option in kindFilters" :key="option.value" type="button"
              class="dev-chip dev-chip--button" :class="{ 'is-active': kindFilter === option.value }"
              :aria-pressed="kindFilter === option.value" @click="kindFilter = option.value">
              {{ option.label }}<span class="dev-chip__count">{{ option.count }}</span>
            </button>
          </div>
          <TInput v-model="keyword" clearable class="dev-toolbar__search" placeholder="搜索标题或内容"
            aria-label="搜索系统通知">
            <template #prefix>
              <TIcon>
                <Search />
              </TIcon>
            </template>
          </TInput>
          <div class="dev-toolbar__actions">
            <span v-if="filtersActive" class="dev-toolbar__hint">
              筛选出 {{ filteredTotal }} / {{ cards.length }} 条
            </span>
            <TButton variant="outline" v-if="filtersActive" @click="resetFilters">
              <TIcon>
                <RefreshLeft />
              </TIcon>
              <span>重置</span>
            </TButton>
          </div>
        </div>

        <p v-if="loading && !cards.length" class="dev-empty-state">系统通知加载中…</p>
        <div v-else-if="!filteredCards.length" class="dev-empty-state">
          <strong>{{ emptyTitle() }}</strong>
          <div v-if="filtersActive" class="dev-list-actions">
            <button class="dev-btn dev-btn--ghost" type="button" @click="resetFilters">清空筛选</button>
          </div>
        </div>
        <template v-else>
          <ul class="dev-stack-list" aria-label="系统通知列表">
            <li v-for="card in pagedCards" :key="card.key" class="dev-stack-item notifications-card"
              :class="{ 'notifications-card--clickable': card.postId != null }"
              :role="card.postId != null ? 'button' : undefined" :tabindex="card.postId != null ? 0 : undefined"
              @click="card.postId != null && openAnnouncement(card)"
              @keydown.enter.prevent="card.postId != null && openAnnouncement(card)">
              <div class="notifications-card__main">
                <div class="notifications-card__head">
                  <strong class="dev-stack-item__title">{{ card.title }}</strong>
                  <span :class="kindChipClass(card.kind)">{{ card.kindLabel }}</span>
                </div>
                <p v-for="(line, index) in card.body" :key="`body-${index}`" class="notifications-card__line">
                  {{ line }}
                </p>
                <p v-if="card.voteHint" class="notifications-card__line notifications-card__line--hint">
                  {{ card.voteHint }}
                </p>
              </div>
              <div class="notifications-card__side">
                <span class="dev-stack-item__meta">{{ card.meta }}</span>
                <div v-if="card.canVote" class="notifications-card__actions">
                  <button class="dev-btn dev-btn--ghost" type="button" :disabled="votingId !== null"
                    @click.stop="vote(card, 'rejected')">
                    拒绝
                  </button>
                  <button class="dev-btn dev-btn--primary" type="button" :disabled="votingId !== null"
                    @click.stop="vote(card, 'approved')">
                    同意公开
                  </button>
                </div>
                <span v-else-if="card.postId != null" class="dev-btn dev-btn--ghost">查看公告</span>
              </div>
            </li>
          </ul>

          <div class="dev-pager">
            <div class="dev-pager__count">
              <span>共 {{ filteredTotal }} 条</span>
              <TSelect v-model="pageSize" aria-label="每页条数" class="dev-pager__size">
                <TOption v-for="size in LIST_PAGE_SIZES" :key="size" :label="`${size} 条/页`" :value="size" />
              </TSelect>
            </div>
            <TPagination v-model:current-page="page" :page-size="pageSize" :total="filteredTotal"
              :pager-count="5" background aria-label="系统通知分页" />
          </div>
        </template>
      </section>
    </template>

    <section v-else class="wallet-section notifications-panel">
      <div class="wb-card-head">
        <div class="wb-card-head__title-block">
          <h3 class="wb-card-head__title">系统通知</h3>
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
          <span v-if="filtersActive" class="wb-toolbar__hint">
            筛选出 {{ filteredTotal }} / {{ cards.length }} 条
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
      <div v-else-if="!filteredCards.length" class="wb-empty">
        <span class="wb-empty__title">{{ emptyTitle() }}</span>
        <div v-if="filtersActive" class="wb-empty__actions">
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
          <li v-for="card in pagedCards" :key="card.key" class="wb-item notifications-card"
            :class="{ 'wb-item--clickable': card.postId != null }"
            :role="card.postId != null ? 'button' : undefined" :tabindex="card.postId != null ? 0 : undefined"
            @click="card.postId != null && openAnnouncement(card)"
            @keydown.enter.prevent="card.postId != null && openAnnouncement(card)">
            <div class="wb-item__main notifications-card__main">
              <strong class="wb-item__title">{{ card.title }}</strong>
              <span v-for="(line, index) in card.body" :key="`body-${index}`" class="wb-item__meta">
                {{ line }}
              </span>
              <span v-if="card.voteHint" class="wb-item__meta">{{ card.voteHint }}</span>
            </div>
            <div class="wb-item__side">
              <span :class="kindBadgeClass(card.kind)">{{ card.kindLabel }}</span>
              <span class="wb-item__meta">{{ card.meta }}</span>
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
              <TButton variant="outline" v-else-if="card.postId != null"
                @click.stop="openAnnouncement(card)">
                查看公告
              </TButton>
            </div>
          </li>
        </ul>
        <div class="wb-pager">
          <div class="wb-pager__count">
            <span>共 {{ filteredTotal }} 条</span>
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
/* 版式全部走统一层，本页不再自带一套：
   - 用户工作台侧用 portal-workbench.css 的 .wb-*（读数条 / 卡头 / 工具栏 / 列表 / 空态 / 徽标 / 分页）；
   - 开发者工作台侧用 dev-base.css 的 .dev-*（读数条 → 提示条 → 内容卡 → 工具栏 → .dev-stack-list → 分页）。
   只剩统一层没有的两件事留在本页：卡片正文的多行排布，以及公开申请的两个投票按钮并排。 */

.notifications-page {
  align-content: start;
}

/* 正文可能有两三行（公开申请有说明行 + 投票进度行），行与行贴紧一点，
   与积分明细那种「一屏很多行」的列表同一处理。 */
.notifications-card__main {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.notifications-card__head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.notifications-card__line {
  margin: 0;
  color: var(--profile-text-sub, #64748b);
  font-size: 13px;
  line-height: 1.7;
}

/* 开发者侧同一行文字取统一层的次级墨色（--dev-muted 与 --profile-text-sub 是同一支灰） */
.dev-page .notifications-card__line {
  color: var(--dev-muted);
}

.notifications-card__line--hint {
  font-variant-numeric: tabular-nums;
}

.notifications-card__side {
  display: flex;
  align-items: flex-end;
  flex-direction: column;
  flex: 0 0 auto;
  gap: 8px;
  text-align: right;
}

.notifications-card__actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

/* 公告卡片整块可点：悬停给出反馈，键盘焦点环不能被 hover 盖掉 */
.notifications-card--clickable {
  cursor: pointer;
  transition: border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
}

.notifications-card--clickable:hover {
  border-color: var(--wb-accent-line);
  background: #f8fbff;
}

.notifications-card--clickable:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--wb-accent) 50%, transparent);
  outline-offset: 2px;
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

@media (max-width: 640px) {
  /* 触屏档：侧栏的动作挤在标题下面，投票按钮平分整行，触摸目标 ≥44px */
  .notifications-card__side {
    align-items: stretch;
    text-align: left;
  }
  .notifications-card__actions .dev-btn {
    flex: 1;
    min-height: 44px;
  }
}
</style>
