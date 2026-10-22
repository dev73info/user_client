<script setup lang="ts">
import { CONTRACT_STATUS, contractStatusLabel } from '@/shared/contracts'
import { contractStatusTone } from '@/shared/contractSign'

/**
 * 合同信息块（编号 / 标题 / 状态 / 指纹 / 有效期）与「查看合同」入口。
 *
 * 只吃展示字段、只发 `view-contract`：爱签预览是**整页跳转**，由视图执行，
 * 组件不碰 `window.location`。
 */
defineProps<{
  contractNo: string
  title: string
  status: number
  contentSha256: string
  /** 平台内置协议（入驻 / 接口使用）不显示有效期与开发周期。 */
  platformAgreement: boolean
  effectiveUntilLabel: string
  developmentCycleText: string
  /** 工作台外壳下的版式微调（原 `.page-shell--workbench .contract-meta`）。 */
  workbench: boolean
}>()

const emit = defineEmits<{
  'view-contract': []
}>()
</script>

<template>
  <div class="contract-meta" :class="{ 'is-workbench': workbench }">
    <div class="contract-meta__facts">
      <p><strong>合同编号：</strong>{{ contractNo }}</p>
      <p><strong>合同标题：</strong>{{ title }}</p>
      <p>
        <strong>签署状态：</strong>
        <span
          class="contract-status-chip"
          :class="`contract-status-chip--${contractStatusTone(status)}`"
          >{{ contractStatusLabel(status) }}</span
        >
      </p>
      <p>
        <strong>合同指纹：</strong><span class="hash-text">{{ contentSha256 }}</span>
      </p>
      <!-- R014：担保合同的有效期截止（＝后签方签署时间 + 开发周期）；未签署完成给中文说明，不显示空值。 -->
      <p v-if="!platformAgreement">
        <strong>有效期截止：</strong
        ><span data-testid="contract-effective-until">{{ effectiveUntilLabel }}</span>
      </p>
      <p v-if="!platformAgreement && developmentCycleText">
        <strong>开发周期：</strong
        ><span data-testid="contract-development-cycle">{{ developmentCycleText }}</span>
      </p>
      <!-- CT-2：平台作废不联动爱签（爱签 OpenAPI 没有作废/撤回接口），
           用户可能在渠道侧仍看到这份合同，必须在页面上讲清楚边界。 -->
      <p v-if="status === CONTRACT_STATUS.voided" class="void-hint">
        <strong>本合同已由平台作废。</strong>
        平台作废只影响本站：爱签渠道侧的合同不会同步撤回，请不要再在爱签侧签署这份合同；
        如已签署，请联系客服处理。
      </p>
    </div>
    <!-- 已签约的合同正文以爱签那份为准，「查看合同」跳爱签预览页。 -->
    <button
      v-if="status === CONTRACT_STATUS.signed"
      class="btn-primary"
      @click="emit('view-contract')"
    >
      查看合同
    </button>
  </div>
</template>

<style scoped>
.contract-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  background: #f8fafc;
  border: 1px solid #dbe5f0;
  border-left: 4px solid #2563eb;
  border-radius: 8px;
  padding: 1rem 1.2rem;
  margin-bottom: 1.5rem;
}

.contract-meta.is-workbench {
  border: 0;
  border-left: 3px solid #247f7d;
  border-radius: 0;
}

.contract-meta__facts {
  flex: 1 1 auto;
  min-width: 0;
}

.contract-meta > .btn-primary {
  flex: 0 0 auto;
}

.contract-meta p {
  margin: 0.45rem 0;
  color: #243044;
  font-size: 0.95rem;
  line-height: 1.65;
}

.contract-meta strong {
  color: #0f172a;
  font-weight: 750;
}

.contract-status-chip {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0.12rem 0.6rem;
  border-radius: 999px;
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 0.84rem;
  font-weight: 750;
}

.contract-status-chip--signing {
  border-color: #fed7aa;
  background: #fff7ed;
  color: #c2410c;
}

.contract-status-chip--signed {
  border-color: #bbf7d0;
  background: #ecfdf5;
  color: #047857;
}

.hash-text {
  display: inline-block;
  max-width: 100%;
  margin-top: 0.2rem;
  padding: 0.28rem 0.45rem;
  border-radius: 5px;
  background: #eaf2ff;
  color: #1e40af;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.86rem;
  font-weight: 700;
  word-break: break-all;
}

/* 已作废合同在渠道侧的提示（CT-2）：平台作废不联动爱签，需要显眼但不吓人。 */
.void-hint {
  color: #92400e;
  padding: 0.75rem 0.9rem;
  border-radius: 8px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  margin-bottom: 1rem;
  line-height: 1.6;
}

.btn-primary {
  min-height: 42px;
  padding: 0.75rem 1.8rem;
  background: #f59e0b;
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.98rem;
  font-weight: 800;
  box-shadow: 0 10px 18px rgba(245, 158, 11, 0.22);
}

/* 工作台外壳下的按钮配色（原 `.page-shell--workbench .btn-primary`） */
.is-workbench .btn-primary {
  background: #247f7d;
  border-color: #247f7d;
  color: #fff;
  box-shadow: none;
}

@media (max-width: 640px) {
  .contract-meta {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
