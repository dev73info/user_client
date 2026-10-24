<script setup lang="ts">
import { computed } from 'vue'

import { TDropdown, TDropdownItem, TDropdownMenu, TIcon, ArrowDown } from 'ui_73info'
import PaymentModeChip from '@/components/PaymentModeChip.vue'
import type { RequirementItem } from '@/api/requirements'
import {
  canClaimResourceWhileLocked,
  isRequirementArchived,
  isRequirementCleared,
  requirementArchiveBanner,
} from '@/shared/requirementArchive'
import {
  moreRowActions,
  primaryRowAction,
  type RequirementRowActionKey,
} from '@/shared/requirementRowActions'
import {
  canClaimResource,
  canOpenAfterSales,
  canToggleRequirementResourceVisibility,
  contractStatusHint,
  currentResourceVisibility,
  formatBudget,
  formatCommentSummary,
  formatRequirementDisplayStatus,
  formatRequirementTime,
  formatResourceVisibility,
  hasBoundResource,
  hasPendingResourceVersionDeleteReview,
  isResourceClaimed,
  latestDeliveryVersionLabel,
  lockRemainingText,
  pendingResourceVersionDeleteRequests,
  publishedVersionCount,
  requirementSubscriptionLabel,
  settlementHint,
  statusBadgeClass,
  toggleResourceVisibilityLabel,
  versionDeleteRejectNote,
  type RequirementRowFacts,
} from '@/shared/requirementRowRules'

/**
 * 需求列表的一行（`<li class="requirement-row wb-item wb-item--clickable">` 那一层）。
 *
 * 有状态的展示项（各条的 loading、审核卡展开态、售后角标）都由视图用 props 传进来，
 * 点击一律 emit 给视图，组件里不带 router / TMessage。
 * 外部事实（合同签署状态 / 资源版本 / 可开票汇总）走 `facts`，判定全部来自 shared 纯函数。
 */
const props = defineProps<{
  item: RequirementItem
  facts: RequirementRowFacts
  /** 版本删除审核卡是否展开：展开态归视图持有，行只据此加 expanded 类、切按钮文案。 */
  versionReviewExpanded: boolean
  contractCreating: boolean
  subscriptionLoading: boolean
  resourceVisibilityLoading: boolean
  resourceDownloadingId: number | null
  /** 售后待办角标文案（空串不渲染），读数只用于悬浮提示。 */
  afterSalesBadge: string
  afterSalesPendingCount: number
}>()

const emit = defineEmits<{
  open: []
  action: [key: RequirementRowActionKey]
  toggleSubscription: []
  toggleVisibility: []
  toggleVersionReview: []
}>()

const archive = computed(() => requirementArchiveBanner(props.item))
const remainingText = computed(() => lockRemainingText(props.item))
/** 下载中的就是本行绑定的那个资源项目。 */
const downloading = computed(() => props.resourceDownloadingId === props.item.bound_resource_id)
const primaryAction = computed(() =>
  primaryRowAction(props.item, props.facts, { contractCreating: props.contractCreating }),
)
const moreActions = computed(() => moreRowActions(props.item, props.facts))

/** 「更多」的 command 回传字符串，在脚本里收口成联合类型再 emit，模板里不写断言。 */
function runMoreAction(key: unknown) {
  emit('action', key as RequirementRowActionKey)
}
</script>

<template>
  <li
    class="requirement-row wb-item wb-item--clickable"
    :class="{ expanded: versionReviewExpanded }"
    :aria-label="`打开「${item.title}」的沟通记录`"
    tabindex="0"
    @click="emit('open')"
    @keydown.enter.prevent="emit('open')"
    @keydown.space.prevent="emit('open')"
  >
    <div class="requirement-card-body">
      <div class="requirement-main wb-item__main">
        <div class="requirement-title wb-item__title">
          <strong>{{ item.title }}</strong>
          <span>{{ item.requirement_id }}</span>
        </div>
        <!-- R014：合同有效期届满后的锁定 / 清除横幅。锁定态可下载、写操作置灰；清除态只剩审计台账。 -->
        <div
          v-if="archive.title"
          class="requirement-archive-banner"
          :class="`requirement-archive-banner--${archive.state}`"
          role="status"
          data-testid="requirement-archive-banner"
        >
          <strong>{{ archive.title }}</strong>
          <span v-if="remainingText" class="requirement-archive-banner__remaining">{{
            remainingText
          }}</span>
          <p>{{ archive.description }}</p>
        </div>
        <div class="requirement-details">
          <!-- 短事实走标签：发布方式用全站共用的 .pay-mode-chip（见 PaymentModeChip，与需求大厅卡片同一枚胶囊，
             底色按发布方式分档），其余走统一层 .wb-badge（浅底 + 深字：绿 = 已公开、琥珀 = 有待审核项）；
             散文式的说明仍用 .requirement-note 独占一行。 -->
          <PaymentModeChip :mode="item.payment_mode" />
          <span v-if="hasBoundResource(item)" class="wb-badge wb-badge--success">{{
            formatResourceVisibility(item)
          }}</span>
          <span v-if="hasBoundResource(item)" class="wb-badge"
            >交付 {{ publishedVersionCount(item, facts) }} 版{{
              latestDeliveryVersionLabel(item, facts)
            }}</span
          >
          <!-- R014：开发周期（天）——担保需求合同有效期依据；无担保 / 未填不渲染。 -->
          <span
            v-if="item.development_cycle_days != null"
            class="wb-badge"
            data-testid="requirement-development-cycle"
            >开发周期 {{ item.development_cycle_days }} 天</span
          >
          <!-- 已转换的不再给按钮（点了必 409），改成一枚不可点的标记；时间挂在 title 上。 -->
          <span
            v-if="isResourceClaimed(item)"
            class="wb-badge wb-badge--success"
            :title="`转换时间：${formatRequirementTime(item.resource_claimed_at ?? '')}`"
            data-testid="requirement-claimed-badge"
            >已转为我的资源</span
          >
          <small v-if="contractStatusHint(item, facts)" class="requirement-note">{{
            contractStatusHint(item, facts)
          }}</small>
          <!-- R014：锁定期内的「转为我的资源」引导（复用 R006 转换入口，转换不可撤销）。 -->
          <small
            v-if="canClaimResourceWhileLocked(item)"
            class="requirement-note requirement-note--block"
            data-testid="requirement-claim-guidance"
          >
            资料保留期内请尽快把交付的资源项目「转为我的资源」：转换后资源归你所有、不可撤销，
            保留期届满平台清除资料后，开发者侧不再控制该资源。
          </small>
          <span
            v-if="hasPendingResourceVersionDeleteReview(item)"
            class="wb-badge wb-badge--warning"
          >
            待审核 · 开发者申请删除
            {{ pendingResourceVersionDeleteRequests(item).length }} 个版本
          </span>
          <small
            v-else-if="
              hasBoundResource(item) &&
              item.resource_version_delete_request_status === 'rejected' &&
              item.resource_version_delete_review_note
            "
            class="requirement-note requirement-note--block"
            >{{ versionDeleteRejectNote(item) }}</small
          >
          <small
            v-if="item.status === 'rejected' && item.review_note"
            class="requirement-note requirement-note--block"
            >驳回原因：{{ item.review_note }}</small
          >
          <small v-if="settlementHint(item)" class="requirement-note requirement-note--block">{{
            settlementHint(item)
          }}</small>
          <small
            v-if="item.comment_rating != null"
            class="requirement-note requirement-note--block"
          >
            我的评价：{{ formatCommentSummary(item.comment_rating, item.comment_text) }}
          </small>
          <small
            v-if="item.developer_comment_rating != null"
            class="requirement-note requirement-note--block"
          >
            对方评价（开发者）：{{
              formatCommentSummary(item.developer_comment_rating, item.developer_comment_text)
            }}
          </small>
        </div>
      </div>
      <aside class="requirement-summary wb-item__side" aria-label="需求摘要">
        <span class="wb-badge" :class="statusBadgeClass(item, facts)">
          {{ formatRequirementDisplayStatus(item, facts) }}
        </span>
        <div class="requirement-budget">
          <small>预算</small>
          <strong>{{ formatBudget(item.budget) }}</strong>
        </div>
        <time>
          <small>发布时间</small>
          <span>{{ formatRequirementTime(item.created_time) }}</span>
        </time>
      </aside>
    </div>
    <!-- 操作区分四层：开关芯片（订阅 / 公开）→ 行内常用动作 → 更多菜单 → 唯一主操作。
       订阅开关每行都有，所以这块不会为空。 -->
    <div class="requirement-actions">
      <div class="requirement-toggles">
        <button
          class="requirement-toggle"
          type="button"
          :aria-pressed="item.subscribe_status_change"
          :disabled="subscriptionLoading"
          :title="
            item.subscribe_status_change ? '已订阅状态变化，点击取消' : '订阅状态变化后通知我'
          "
          @click.stop="emit('toggleSubscription')"
        >
          <span class="requirement-toggle__track" aria-hidden="true"></span>
          {{ subscriptionLoading ? '提交中...' : requirementSubscriptionLabel(item) }}
        </button>
        <button
          v-if="canToggleRequirementResourceVisibility(item) && !isRequirementArchived(item)"
          class="requirement-toggle"
          type="button"
          :aria-pressed="currentResourceVisibility(item) === 'public'"
          :disabled="resourceVisibilityLoading"
          :title="
            currentResourceVisibility(item) === 'review'
              ? '点击撤回公开审核，资源恢复为私有'
              : '切换关联资源的公开 / 私有'
          "
          @click.stop="emit('toggleVisibility')"
        >
          <span class="requirement-toggle__track" aria-hidden="true"></span>
          {{ resourceVisibilityLoading ? '提交中...' : toggleResourceVisibilityLabel(item) }}
        </button>
      </div>

      <!-- 行内控件各自处理自己的点击与回车，在容器这一层就拦住，别再冒泡到整行的「打开沟通页」。
         注意「更多」那个按钮上不能再挂 @click.stop：TDropdown 的触发监听挂在自己的外层
         span 上（el-dropdown 当时是挂在触发元素自身），在按钮处截断冒泡等于菜单永远打不开。 -->
      <div class="requirement-actions__list" @click.stop @keydown.stop>
        <button
          v-if="hasBoundResource(item) && !isRequirementCleared(item)"
          class="ghost small action-emphasis"
          type="button"
          :disabled="downloading"
          @click.stop="emit('action', 'download')"
        >
          {{ downloading ? '准备中...' : '下载' }}
        </button>
        <button
          v-if="hasBoundResource(item)"
          class="ghost small action-quiet"
          type="button"
          @click.stop="emit('action', 'conversation')"
        >
          会话
        </button>
        <!-- 已结单且有交付资源、尚未转换时才出现；转换后由上方的「已转为我的资源」标记接替。 -->
        <button
          v-if="canClaimResource(item)"
          class="ghost small action-emphasis"
          type="button"
          title="把开发者交付的资源转为我自己的资源项目（不可撤销）"
          @click.stop="emit('action', 'claim-resource')"
        >
          转为我的资源
        </button>
        <!-- 版本删除审核没有别的入口（整行点击归会话），所以这里给它一个按钮，
           与下方展开的审核卡片成对出现。 -->
        <button
          v-if="hasPendingResourceVersionDeleteReview(item) && !isRequirementArchived(item)"
          class="ghost small action-emphasis"
          type="button"
          :aria-expanded="versionReviewExpanded"
          @click.stop="emit('toggleVersionReview')"
        >
          {{ versionReviewExpanded ? '收起审核' : '审核资源' }}
        </button>
        <button
          v-if="canOpenAfterSales(item) && !isRequirementArchived(item)"
          class="ghost small action-emphasis"
          :class="{ 'has-todo-badge': afterSalesBadge }"
          type="button"
          @click.stop="emit('action', 'after-sales')"
        >
          解除合作
          <span
            v-if="afterSalesBadge"
            class="todo-badge"
            :title="`有 ${afterSalesPendingCount} 条解除合作待你处理`"
            >{{ afterSalesBadge }}</span
          >
        </button>

        <TDropdown
          v-if="moreActions.length && !isRequirementArchived(item)"
          trigger="click"
          @command="runMoreAction"
        >
          <button
            class="ghost small requirement-actions__more"
            type="button"
            aria-haspopup="menu"
            title="更多操作"
          >
            更多
            <TIcon>
              <ArrowDown />
            </TIcon>
          </button>
          <template #dropdown>
            <TDropdownMenu>
              <TDropdownItem
                v-for="entry in moreActions"
                :key="entry.key"
                :command="entry.key"
                :disabled="entry.disabled"
                :title="entry.title"
                :class="{ 'is-danger': entry.danger }"
              >
                {{ entry.label }}
              </TDropdownItem>
            </TDropdownMenu>
          </template>
        </TDropdown>

        <button
          v-if="primaryAction && !isRequirementArchived(item)"
          class="ghost small action-primary"
          type="button"
          :disabled="primaryAction.disabled"
          @click.stop="emit('action', primaryAction.key)"
        >
          {{ primaryAction.label }}
        </button>
      </div>
    </div>
  </li>
</template>
