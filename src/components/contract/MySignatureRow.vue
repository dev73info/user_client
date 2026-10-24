<script setup lang="ts">
import type { MyContractSummary } from '@/api/contracts'
import {
  ATTACHMENT_REVIEW_STATUS,
  CONTRACT_CONTENT_SOURCE,
  CONTRACT_STATUS,
  attachmentReviewStatusLabel,
  contractContentSourceLabel,
  contractEffectiveUntilLabel,
  contractStatusLabel,
} from '@/shared/contracts'
import { getSignatureState, signatureStateLabels } from '@/utils/contractSignatures'

const props = defineProps<{
  item: MyContractSummary
  /** 当前登录用户名：决定「我的身份」与签名态判读。 */
  username: string
}>()

const emit = defineEmits<{
  open: []
}>()

function roleLabel(item: MyContractSummary) {
  return item.party_a_username === props.username ? '甲方' : '乙方'
}

function stateOf(item: MyContractSummary) {
  return getSignatureState(item, props.username)
}

/* 列表徽标：签名态认不出「过期 / 拒签 / 撤销」这几种新增状态（都会落到 unavailable），
   这时直接显示合同状态，免得一律写成「暂不可签署」。 */
function badgeLabel(item: MyContractSummary) {
  const state = stateOf(item)
  if (state === 'unavailable' && item.status !== CONTRACT_STATUS.awaiting) {
    return contractStatusLabel(item.status)
  }
  return signatureStateLabels[state]
}

/* 状态标签走统一层（.wb-badge）：浅底 + 深字，终止态用中性档。 */
function badgeClass(item: MyContractSummary) {
  const state = stateOf(item)
  if (state === 'pending') return 'wb-badge--warning'
  if (state === 'waiting') return 'wb-badge--accent'
  if (state === 'signed') return 'wb-badge--success'
  return ''
}

/**
 * R012：合同来源文案，列表里用来区分「平台生成 / 上传附件 / 页面拟定」三种来源。
 *
 * 非平台来源时一并带上附件审核态（待审核 / 已放行 / 已驳回）——只放「上传附件」字样，
 * 看的人不知道这份附件现在卡在哪一步。字段由后端 `CONTRACT_FIELDS_SUMMARY` 透出，
 * 后端未上线时 `content_source` 缺省即「平台生成」。
 */
function sourceChip(item: MyContractSummary): string {
  const source = item.content_source ?? CONTRACT_CONTENT_SOURCE.platform
  const label = contractContentSourceLabel(source)
  if (source === CONTRACT_CONTENT_SOURCE.platform) {
    return label
  }
  return `${label} · ${attachmentReviewStatusLabel(item.attachment_review_status ?? ATTACHMENT_REVIEW_STATUS.none)}`
}

/**
 * R014：合同有效期截止（担保需求在双方签署完成时写入 = 后签方签署时间 + 开发周期）。
 * 未签署完成时给「待双方签署完成后计算」这类中文说明，不显示空值；非担保合同按平台规则说明。
 */
function effectiveUntilLabel(item: MyContractSummary): string {
  return contractEffectiveUntilLabel(item.status, item.effective_until)
}
</script>

<template>
  <li
    class="requirement-row wb-item wb-item--clickable"
    :aria-label="`打开合同「${item.title}」`"
    tabindex="0"
    @click="emit('open')"
    @keydown.enter.prevent="emit('open')"
    @keydown.space.prevent="emit('open')"
  >
    <div class="requirement-card-body">
      <div class="requirement-main wb-item__main">
        <div class="requirement-title wb-item__title">
          <strong>{{ item.title }}</strong>
          <span>{{ item.contract_no || '暂无合同编号' }}</span>
        </div>
        <div class="requirement-details">
          <span class="wb-item__meta"
            >甲方 · {{ item.party_a_name || item.party_a_username || '未指定' }}</span
          >
          <span class="wb-item__meta"
            >乙方 · {{ item.party_b_name || item.party_b_username || '未指定' }}</span
          >
          <span class="wb-item__meta">我的身份：{{ roleLabel(item) }}</span>
          <!-- R012：区分平台生成 / 上传附件 / 页面拟定三种来源（非平台来源带附件审核态）。 -->
          <span class="wb-item__meta wb-item__meta--source">来源：{{ sourceChip(item) }}</span>
          <!-- R014：担保需求合同展示有效期截止（＝后签方签署时间 + 开发周期）；未签署完成给中文说明。
               只对需求合同渲染：平台协议（用户服务协议 / 开发者入驻协议）没有有效期，渲染会给出错误的「待计算」文案。 -->
          <span
            v-if="item.requirement_id"
            class="wb-item__meta wb-item__meta--effective"
            data-testid="contract-effective-until"
          >
            有效期截止：{{ effectiveUntilLabel(item) }}
          </span>
        </div>
      </div>
      <aside class="requirement-summary wb-item__side" aria-label="合同摘要">
        <span class="wb-badge" :class="badgeClass(item)">{{ badgeLabel(item) }}</span>
        <time>
          <small>创建时间</small>
          <span>{{ item.created_at }}</span>
        </time>
      </aside>
    </div>
    <div class="requirement-actions">
      <div class="requirement-actions__list" @click.stop @keydown.stop>
        <button
          class="ghost small"
          :class="stateOf(item) === 'pending' ? 'action-primary' : 'action-emphasis'"
          type="button"
          @click="emit('open')"
        >
          {{ stateOf(item) === 'pending' ? '去签署' : '查看详情' }}
        </button>
      </div>
    </div>
  </li>
</template>
