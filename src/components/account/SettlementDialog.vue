<script setup lang="ts">
/**
 * 「收款银行卡」弹窗：渠道原话 / 主体变更与缺资料提示 + 银行卡表单（卡号后四位、开户行、账户类型）。
 *
 * 表单只收契约 `SettlementApplyRequest` / `SettlementAccountChangeRequest` 要的那几项：
 * 户名取自实名主体、开户行由银行下拉映射成 `bank_name`、卡号**只收后四位**。
 * 开户省份 / 城市不在这两条请求体里，所以没有这两格——收了也无处可发。
 *
 * 从 `AccountCouponsView` 抽出来的**纯展示**弹窗：请求、校验、toast 全在
 * `composables/useSettlementAccount.ts`（组件不碰 `@/api/*`、`TMessage`、`router`）。
 *
 * 状态归属：
 * - `visible` / `loading` / `saving`：弹窗开合与两个加载位由父级持有；
 * - 三个输入框的草稿 + 一组 `update:*`：父级那份 `settleForm` 是唯一草稿（提交处理器读它），
 *   这里只做受控输入并回传，不在组件内另存一份；
 * - 其余 `providerError` / `rejected` / `corporateLocked` / `subjectMismatch` /
 *   `materialMissing*` / `subjectLabel` / `cardPlaceholder`：父级算好传下来
 *   （同一个判断不给两个文件各写一遍）；
 * - 「缺资料去补」与「取消」都是父级的动作（关本弹窗、开实名表单、清表单），这里只 emit。
 *
 * 样式：`.settle-*` 整组原来在视图的 scoped 块里，弹窗节点搬进来后父级 scoped 不再命中
 * （整块塌版），随组件搬走。
 */
import { computed } from 'vue'

import { settlementBanks } from '@/utils/settlementAccount'
import type { SelectModelValue } from 'ui_73info'
import {
  TAlert,
  TButton,
  TDialog,
  TForm,
  TFormItem,
  TInput,
  TLoading,
  TOption,
  TSelect,
} from 'ui_73info'

const props = defineProps<{
  /** 弹窗是否打开：父级持有。 */
  visible: boolean
  /** 打开时的一次性查询（会员状态 + 脱敏明细）正在进行。 */
  loading: boolean
  /** 提交进行中：表单整体与两个按钮一起置灰。 */
  saving: boolean
  /** 是否已绑卡：决定卡号提示与主按钮文案（「绑定」还是「确认更换」）。 */
  bound: boolean
  /** 企业 / 个体工商户主体：只能绑对公账户。 */
  corporateLocked: boolean
  /** 已绑的卡挂在旧主体上（实名主体变更过）。 */
  subjectMismatch: boolean
  /** 当前实名主体的中文口径（「个人」/「企业 / 个体工商户」）。 */
  subjectLabel: string
  /** 企业进件资料缺项（缺任一项渠道都会拒绝建会员）。 */
  materialMissing: boolean
  /** 缺的是哪几项，拼成一句话。 */
  materialMissingText: string
  /** 渠道侧最近一次拒绝的原话；空串表示没有。 */
  providerError: string
  /** 渠道已明确拒绝开通（决定告警配色与是否给「去补资料」的指路）。 */
  rejected: boolean
  /** 卡号输入框的提示（已绑账户时带后四位）。 */
  cardPlaceholder: string
  /** 三份草稿字段（父级那份 `settleForm`）。 */
  cardId: string
  bankCode: string
  bankAcctType: string
}>()

const emit = defineEmits<{
  /** TDialog 自己关掉（遮罩 / Esc / 右上角）：父级只回写可见性，不清表单（与拆分前同口径）。 */
  'update:visible': [visible: boolean]
  /** 点了「取消」：父级关弹窗并清掉未提交的输入。 */
  cancel: []
  'update:card-id': [cardId: string]
  'update:bank-code': [bankCode: string]
  'update:bank-acct-type': [bankAcctType: string]
  /** 点了主按钮：校验与请求都在父级。 */
  submit: []
  /** 点了「去变更认证类型补齐/核对资料」：父级关本弹窗并打开实名表单。 */
  'fix-material': []
}>()

/** 下拉清空时 `TSelect` 回的是 null；草稿字段是字符串，这里统一折成空串（字典里没有空键）。 */
function selectText(value: SelectModelValue): string {
  return value == null ? '' : String(value)
}

/** 受控输入：取值来自父级，写入立刻回传（组件内不另存草稿）。 */
const cardId = computed<string>({
  get: () => props.cardId,
  set: (next: string) => emit('update:card-id', next),
})

const bankCode = computed<string>({
  get: () => props.bankCode,
  set: (next: SelectModelValue) => emit('update:bank-code', selectText(next)),
})

const bankAcctType = computed<string>({
  get: () => props.bankAcctType,
  set: (next: SelectModelValue) => emit('update:bank-acct-type', selectText(next)),
})

/**
 * 「渠道拒绝」之后用户该做什么：先回去核对资料重新提交认证（唯一自助路径）；资料无误
 * 还是不过就只能让人工介入——结论在渠道手里，但要让用户知道还能联系平台客服。
 */
const rejectedGuide = computed(() => {
  const action = props.corporateLocked
    ? '请在「认证管理」→「变更认证类型」核对企业名称、统一社会信用代码、法人信息与对公账户户名，确认无误后重新提交企业认证，通过后再回来绑定对公账户'
    : '请核对实名信息与银行卡户名是否一致，确认无误后重新提交'
  return `${action}；若资料核对无误仍未通过，可联系平台客服协助核对渠道结论。`
})
</script>

<template>
  <TDialog
    :open="props.visible"
    title="收款银行卡"
    class="realname-dialog"
    width="520px"
    @update:open="emit('update:visible', $event)"
  >
    <TLoading tag="div" :loading="props.loading" class="settle-dialog">
      <!-- 渠道原话：会员停在「待认证 / 未通过」时，这是唯一能对上号的线索。
           渠道已明确拒绝（企业开户审核未通过、开户失败）时升级成 danger，
           并把「下一步做什么」写出来——只说原因，用户照样不知道从哪下手。 -->
      <TAlert
        v-if="props.providerError"
        class="settle-dialog__alert"
        :tone="props.rejected ? 'danger' : 'warning'"
        :closable="false"
        show-icon
        :title="props.providerError"
      >
        <template v-if="props.rejected">
          <p class="settle-dialog__alert-text">{{ rejectedGuide }}</p>
          <TButton
            v-if="props.corporateLocked"
            variant="solid"
            tone="accent"
            class="settle-dialog__alert-action"
            size="sm"
            @click="emit('fix-material')"
          >
            去「变更认证类型」核对企业资料
          </TButton>
        </template>
      </TAlert>

      <!-- 实名主体变更后旧卡不能再收款：先把原因说清楚，再给「按新主体重新绑定」的动作 -->
      <TAlert
        v-if="props.subjectMismatch"
        class="settle-dialog__alert"
        tone="warning"
        :closable="false"
        show-icon
        :title="
          props.materialMissing
            ? `企业实名资料缺少${props.materialMissingText}，收款账户暂时无法按新主体重建`
            : '实名主体已变更，原银行卡需要按新主体重新绑定'
        "
      >
        <p class="settle-dialog__alert-text">
          合同款只会结算到与当前实名主体一致的收款账户，变更前绑定的卡渠道不会再用。
          <template v-if="props.materialMissing">
            按新主体重建收款账户要读实名资料里的{{
              props.materialMissingText
            }}，当前企业实名没有；先补齐资料并重新提交企业认证，通过后再回来绑定{{
              props.corporateLocked ? '对公账户' : '银行卡'
            }}。
          </template>
          <template v-else>
            请按「{{ props.subjectLabel }}」重新绑定银行卡{{
              props.corporateLocked ? '；企业主体需要对公账户' : ''
            }}。
          </template>
        </p>
        <!-- 表单常驻：不再先给一屏只读态再点「更换」才进表单（2026-10-04 改）；
             已绑卡时把渠道返回的脱敏明细回填进来，用户只改要改的字段 -->
        <TButton
          v-if="props.materialMissing"
          variant="solid"
          tone="accent"
          class="settle-dialog__alert-action"
          size="sm"
          @click="emit('fix-material')"
        >
          去「变更认证类型」补齐企业资料
        </TButton>
      </TAlert>

      <!-- 企业会员现在只在「结算账户」这一步创建：首次开通时如果实名里的企业进件资料
           不齐，渠道一定会拒，而那时已经没有「上次入驻失败」的 provider_error 可看，
           所以这里也提前拦一次（此前只有「换主体」那条分支会拦）。 -->
      <TAlert
        v-if="props.materialMissing && !props.subjectMismatch"
        class="settle-dialog__alert"
        tone="warning"
        :closable="false"
        show-icon
        :title="`企业实名资料缺少${props.materialMissingText}，无法开通企业收款账户`"
      >
        <p class="settle-dialog__alert-text">
          渠道创建企业会员时逐项校验营业执照文件、企业所在省市、注册地址、经营范围与有效期，
          缺任一项都会被拒；先把资料补齐并重新提交企业认证，通过后再回来绑定对公账户。
        </p>
        <TButton
          variant="solid"
          tone="accent"
          class="settle-dialog__alert-action"
          size="sm"
          @click="emit('fix-material')"
        >
          去「变更认证类型」补齐企业资料
        </TButton>
      </TAlert>

      <TForm
        label-position="left"
        label-width="96px"
        class="settle-form"
        :disabled="props.saving || props.loading"
        @submit="emit('submit')"
      >
        <TFormItem label="卡号后四位" required>
          <TInput
            v-model="cardId"
            inputmode="numeric"
            :maxlength="4"
            :placeholder="props.cardPlaceholder"
          />
        </TFormItem>
        <TFormItem label="开户银行" required>
          <TSelect
            v-model="bankCode"
            :options="settlementBanks"
            filterable
            clearable
            placeholder="搜索或选择银行名称"
            no-match-text="未找到该银行"
            style="width: 100%"
          />
        </TFormItem>
        <TFormItem label="账户类型">
          <TSelect v-model="bankAcctType" style="width: 100%">
            <TOption label="个人银行卡" value="2" />
            <TOption label="企业对公账户" value="1" />
          </TSelect>
        </TFormItem>
        <TFormItem>
          <div class="settle-form__actions">
            <TButton :disabled="props.saving" @click="emit('cancel')">取消</TButton>
            <TButton type="submit" variant="solid" tone="accent" :loading="props.saving">
              {{
                props.saving
                  ? '保存中...'
                  : props.bound
                    ? '确认更换'
                    : props.corporateLocked
                      ? '绑定对公账户'
                      : '绑定银行卡'
              }}
            </TButton>
          </div>
        </TFormItem>
      </TForm>
    </TLoading>
  </TDialog>
</template>

<style scoped>
.settle-dialog {
  display: grid;
  gap: 16px;
}

/* 实名主体变更提示：间距交给弹窗自身的 gap，不再叠 margin */
.settle-dialog__alert {
  margin: 0;
}

.settle-dialog__alert-text {
  margin: 4px 0 0;
  color: var(--73-ink-muted);
  font-size: 12px;
  line-height: 1.6;
}

/* 缺企业资料时的指路按钮：跟在说明文字后面，与正文留出呼吸 */
.settle-dialog__alert-action {
  margin-top: 10px;
}

/* TForm 本身是弹窗 body 的 flex 子项，同样要允许收缩到比内容窄 */
.settle-form {
  min-width: 0;
}

/* 表单底部动作条：取消 + 确认（主操作）靠右，两者留 12px 间距 */
.settle-form__actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
</style>
