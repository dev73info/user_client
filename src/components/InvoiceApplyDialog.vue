<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'

import {
  applyInvoices,
  getInvoiceSummary,
  type AppliedInvoices,
  type InvoiceableSummary,
  type InvoiceKind,
  type InvoiceRecord,
} from '@/api/invoices'
import { useToast } from '@/composables/useToast'

/** 开票主体：平台服务费票由平台开给需求方，开发者收入票由乙方开给需求方。 */
type InvoiceSide = 'platform' | 'developer'

type InvoiceForm = {
  invoiceTitle: string
  taxNumber: string
  recipientEmail: string
  /** 票种：默认普票，只有企业主体买方才能改成专票。 */
  invoiceKind: InvoiceKind
  /** 专票的购买方四项资料（普票时不提交）。 */
  buyerAddress: string
  buyerPhone: string
  buyerBankName: string
  buyerBankAccount: string
}

const props = defineProps<{
  visible: boolean
  token: string
  requirementId: string
  /** 当前用户在本需求中的身份：需求方一次开出两张票，乙方只拿自己那张开发者收入票。 */
  role: 'customer' | 'developer'
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  submitted: []
}>()

const { showToast } = useToast()

// 申请合并成一次动作、抬头只剩一份，草稿也跟着只剩一份。
const DRAFT_KEY = 'invoice_apply_draft_v1'

/** 两侧共用的抬头 / 税号 / 邮箱分别对应哪种票、由谁开具。 */
const COPY: Record<'customer' | 'developer', {
  kicker: string
  title: string
  issuer: string
  hint: string
  amountNote: string
  submitText: string
}> = {
  customer: {
    kicker: 'CUSTOMER / INVOICE',
    title: '获取发票',
    issuer: '平台票 + 开发者票',
    hint: '一次申请把本需求能开的票都开出来：平台服务费票由平台开具，开发者收入票由乙方开具，两张票共用这份抬头。',
    amountNote: '本次申请可开出的合计（平台服务费票 + 开发者收入票）',
    submitText: '提交开票申请',
  },
  developer: {
    kicker: 'DEVELOPER / INVOICE',
    title: '获取开发者发票',
    issuer: '开发者发票',
    hint: '开发者收入发票由乙方开具给需求方：抬头与税号按需求方实名主体带出，需求方为企业或个体工商户时税号必填；发票文件上传后需求方可在「我的发票」下载。',
    amountNote: '开发者收入（定金 + 尾款合并开票）',
    submitText: '提交开发者发票申请',
  },
}

const submitting = ref(false)
const summaryLoading = ref(false)
const summary = ref<InvoiceableSummary | null>(null)
const form = reactive<InvoiceForm>({
  invoiceTitle: '',
  taxNumber: '',
  recipientEmail: '',
  invoiceKind: 'ordinary',
  buyerAddress: '',
  buyerPhone: '',
  buyerBankName: '',
  buyerBankAccount: '',
})

const copy = computed(() => COPY[props.role])

/**
 * 可开票金额：本次申请能开出的合计票面。
 *
 * 需求方是「平台服务费票 + 开发者收入票」，乙方只有自己那一侧；已经开过（含审核中、已通过）的
 * 一侧不计入，被红冲的一侧会重新计入——所以两票都提交完之后这里会变成 0，也就提交不了第二次。
 */
const amountFen = computed(() => summary.value?.invoiceableTotalFen ?? 0)
const amountCny = computed(() => summary.value?.invoiceableTotalCny ?? '0.00')

/**
 * 已经存在的发票记录：已提交过的一侧只展示进度，不重复申请。
 *
 * 平台服务费票只对需求方展示：票是平台开给他的（买方与接收人都是他），乙方那份汇总里后端
 * 也不会回这张票（见 `invoiceable_summary`），这里再按角色挡一道，避免哪个入口漏了过滤。
 */
const existingInvoices = computed<{ side: InvoiceSide; invoice: InvoiceRecord }[]>(() => {
  const records: { side: InvoiceSide; invoice: InvoiceRecord }[] = []
  if (props.role === 'customer' && summary.value?.platformInvoice) {
    records.push({ side: 'platform', invoice: summary.value.platformInvoice })
  }
  if (summary.value?.developerInvoice) {
    records.push({ side: 'developer', invoice: summary.value.developerInvoice })
  }
  return records
})

/** 需要红冲的记录：票面与已实际发生的净额不一致（售后退款 / 赔付已成立）。 */
const staleInvoices = computed(() => existingInvoices.value.filter((item) => item.invoice.reversalRequired))

/**
 * 本次申请会开出哪几张票。判定与后端一致（见 `apply_invoices`）：某一侧已经开过、或没有可开
 * 金额，就不在这次申请里；平台服务费票只有需求方能申请。
 */
const openSides = computed<InvoiceSide[]>(() => {
  const sides: InvoiceSide[] = []
  if (
    props.role === 'customer'
    && !summary.value?.platformInvoice
    && (summary.value?.platformFeeFen ?? 0) > 0
  ) {
    sides.push('platform')
  }
  if (!summary.value?.developerInvoice && (summary.value?.developerInvoiceFen ?? 0) > 0) {
    sides.push('developer')
  }
  return sides
})

function invoiceSideLabel(side: InvoiceSide) {
  return side === 'platform' ? '平台服务费发票' : '开发者服务收入发票'
}

function invoiceStatusLabel(status: InvoiceRecord['status']) {
  return {
    requested: '待处理',
    under_review: '审核中',
    approved: '已开具',
    rejected: '需补充材料',
    reversed: '已红冲',
  }[status]
}

/**
 * 进度行里的票种前缀。
 *
 * 只给专票点名：普票是默认票种，每一行都写一遍只是噪音；专票是客户特意申请的，
 * 值得在进度里留个痕，也方便对着票面看清这次申请的是哪一种。
 */
function kindNoticePrefix(kind: InvoiceKind) {
  return kind === 'special' ? '增值税专用发票 · ' : ''
}

/**
 * 开票信息预填：抬头 / 税号 / 接收邮箱**统一按买方（需求方）的实名主体**来。
 *
 * 两张票都是开给同一个需求方的，所以乙方打开弹窗时带出的也是需求方的资料，而不是乙方自己的
 * 公司名——「发票开给谁」不因为谁来申请而改变。这份主体由后端随汇总一起给出（见
 * `InvoiceBuyerSubject`），前端不再单独去查实名与账户资料，两个视角只有一处口径。
 */
const buyer = computed(() => summary.value?.buyer ?? null)

/** 买方在本视角下的称呼：需求方看自己，乙方看客户。文案里拼它，好让乙方一眼看出带出的是谁。 */
const buyerPrefix = computed(() => (props.role === 'customer' ? '' : '需求方'))

/** 买方是否企业 / 个体工商户：抬头取公司全称，且这一侧的税号必填。 */
const isOrganizationBuyer = computed(() => buyer.value?.isOrganization ?? false)

/** 企业 / 个体工商户买方必须给税号：普票与专票都一样，前端先挡一道，后端同样会拒。 */
const isTaxNumberRequired = computed(() => isOrganizationBuyer.value)

/** 企业主体（实名类型 `ENTERPRISE`）：唯一能申请专用发票的买方。 */
const ENTERPRISE_AUTH_TYPE = 'ENTERPRISE'

/**
 * 能不能开专票：只有**企业主体**可以。
 *
 * 个人买方没有税号，开不了专票；个体工商户虽是企业组织形式，但平台口径是专票只给企业申请。
 * 买方实名还没通过时 `authType` 是空串，这时也不给专票入口，免得提交后被后端驳回。
 */
const isSpecialAvailable = computed(() => buyer.value?.authType === ENTERPRISE_AUTH_TYPE)

/** 本次申请是不是专票：非企业买方即使草稿里存着专票，也按普票提交。 */
const isSpecialInvoice = computed(
  () => form.invoiceKind === 'special' && isSpecialAvailable.value,
)

/** 专票需要购买方四项资料；名称与税号已在上面的抬头 / 税号里。 */
const SPECIAL_FIELDS: { key: 'buyerAddress' | 'buyerPhone' | 'buyerBankName' | 'buyerBankAccount'; label: string }[] = [
  { key: 'buyerAddress', label: '注册地址' },
  { key: 'buyerPhone', label: '联系电话' },
  { key: 'buyerBankName', label: '开户银行' },
  { key: 'buyerBankAccount', label: '银行账号' },
]

/** 专票还缺哪几项购买方资料；资料齐了或本次是普票时返回空数组。 */
function missingSpecialFields(): string[] {
  if (!isSpecialInvoice.value) {
    return []
  }
  return SPECIAL_FIELDS.filter((field) => !form[field.key].trim()).map((field) => field.label)
}

// 企业/个体户用公司全称，个人用实名姓名；实名未通过时后端给空串，这里就留给用户手填。
const prefillTitle = computed(() => buyer.value?.title ?? '')
const prefillTaxNumber = computed(() => buyer.value?.taxNumber ?? '')

/** 预填情况的说明：带出来了就说来源，没带出来是因为实名没过，提示手填。 */
const prefillHint = computed(() => {
  if (buyer.value?.title) {
    return props.role === 'customer'
      ? '抬头与税号已按本人实名主体自动填写，可修改。'
      : '抬头与税号已按需求方（客户）实名主体自动填写，可修改。'
  }
  if (!buyer.value) {
    return ''
  }
  return buyer.value.realnameStatus === 'pending'
    ? `${buyerPrefix.value}实名认证审核中，抬头与税号需手动填写。`
    : `${buyerPrefix.value}未完成实名认证，抬头与税号需手动填写。`
})

/** 预填没成功时才需要用户注意，用警示样式；自动带出只是说明，用弱化样式。 */
const prefillNeedsAttention = computed(() => !buyer.value?.title && !!buyer.value)

/** 只填充空字段，绝不覆盖用户输入或已保存的草稿。必须在 restoreDraft 之后调用。 */
function applyPrefill() {
  if (!form.invoiceTitle.trim() && prefillTitle.value) {
    form.invoiceTitle = prefillTitle.value
  }
  if (!form.taxNumber.trim() && prefillTaxNumber.value) {
    form.taxNumber = prefillTaxNumber.value
  }
  if (!form.recipientEmail.trim() && buyer.value?.email) {
    form.recipientEmail = buyer.value.email
  }
  // 买方主体一确定就把开不出来的票种归回普票：草稿里可能存着专票，而非企业主体只能开普票。
  // 只在拿到买方资料后判断——资料还没回来时不能替用户改票种（那时 `isSpecialAvailable` 是 false）。
  if (buyer.value && !isSpecialAvailable.value && form.invoiceKind === 'special') {
    form.invoiceKind = 'ordinary'
  }
}

/** 抬头与实名主体不一致时给出提醒文案；一致或无从比对时返回空串。 */
function invoiceTitleNotice(title: string) {
  const expected = prefillTitle.value
  const trimmed = title.trim()
  if (expected && trimmed && trimmed !== expected) {
    return `发票抬头与${buyerPrefix.value}实名主体「${expected}」不一致，请确认无误`
  }
  return ''
}

function restoreDraft() {
  const raw = localStorage.getItem(DRAFT_KEY)
  if (!raw) {
    return
  }
  try {
    const draft = JSON.parse(raw) as Partial<InvoiceForm>
    if (!form.invoiceTitle.trim()) {
      form.invoiceTitle = draft.invoiceTitle ?? ''
    }
    if (!form.taxNumber.trim()) {
      form.taxNumber = draft.taxNumber ?? ''
    }
    if (!form.recipientEmail.trim()) {
      form.recipientEmail = draft.recipientEmail ?? ''
    }
    // 票种与专票资料同样只填空：旧草稿没有这几个字段，读出来是 undefined，按默认值兜底。
    // 这里不判「能不能开专票」——草稿恢复时买方主体可能还没回来，等 `applyPrefill` 拿到买方
    // 资料后再把非企业主体的专票归回普票。
    if (draft.invoiceKind === 'special') {
      form.invoiceKind = 'special'
    }
    for (const field of SPECIAL_FIELDS) {
      if (!form[field.key].trim()) {
        form[field.key] = draft[field.key] ?? ''
      }
    }
  } catch {
    localStorage.removeItem(DRAFT_KEY)
  }
}

function saveDraft() {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(form))
  showToast('草稿已保存', 'success')
}

/** 拉取本需求的合并开票汇总：金额由后端按已成功分账的结算单算出，买方主体也随它一起回来。 */
async function ensureSummary() {
  if (summaryLoading.value || !props.token || !props.requirementId) {
    return
  }
  summaryLoading.value = true
  try {
    summary.value = await getInvoiceSummary(props.token, props.requirementId)
    // 拿到买方主体就补齐还空着的字段：只填空字段，用户已经手填或草稿里存过的都不动。
    applyPrefill()
  } catch (error) {
    summary.value = null
    showToast(error instanceof Error ? error.message : '加载可开票金额失败', 'error')
  } finally {
    summaryLoading.value = false
  }
}

function close() {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(form))
  emit('update:visible', false)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    close()
  }
}

/** 本次申请真正新建了哪几张票：申请前没有、响应里有，才算新建（已开过的原票会被回放）。 */
function createdSides(applied: AppliedInvoices): InvoiceSide[] {
  const sides: InvoiceSide[] = []
  if (applied.platformInvoice && !summary.value?.platformInvoice) {
    sides.push('platform')
  }
  if (applied.developerInvoice && !summary.value?.developerInvoice) {
    sides.push('developer')
  }
  return sides
}

function createdToast(sides: InvoiceSide[]) {
  if (sides.length > 1) {
    return '平台发票与开发者发票申请已提交，到「我的发票」可查看进度'
  }
  if (sides[0] === 'platform') {
    return '平台发票申请已提交，到「我的发票」可查看进度'
  }
  if (sides[0] === 'developer') {
    return '开发者发票申请已提交，乙方上传发票文件后可在「我的发票」下载'
  }
  // 两侧都只是回放（并发下来别人刚申请过）：不谎报新建，只提示进度已经在这里了。
  return '本需求的开票申请已提交，到「我的发票」可查看进度'
}

async function submit() {
  if (!form.invoiceTitle.trim()) {
    showToast('请填写发票抬头', 'warning')
    return
  }
  if (amountFen.value <= 0) {
    showToast('本需求暂无可开票的已结算金额', 'warning')
    return
  }
  if (isTaxNumberRequired.value && !form.taxNumber.trim()) {
    showToast(`${buyerPrefix.value}实名主体为企业或个体工商户，请填写税号`, 'warning')
    return
  }
  // 专票的资料要求比后端那份「缺项报错」更早生效：这里缺哪几项就直接说哪几项。
  const missingSpecial = missingSpecialFields()
  if (missingSpecial.length > 0) {
    showToast(`增值税专用发票需要填写：${missingSpecial.join('、')}`, 'warning')
    return
  }
  const notice = invoiceTitleNotice(form.invoiceTitle)
  submitting.value = true
  try {
    const applied = await applyInvoices(props.token, {
      requirement_id: props.requirementId,
      invoice_title: form.invoiceTitle.trim(),
      tax_number: form.taxNumber.trim(),
      recipient_email: form.recipientEmail.trim(),
      invoice_kind: form.invoiceKind,
      // 普票不带专票资料：用户先填了专票资料又改回普票时，别把无关信息提交上去。
      buyer_address: isSpecialInvoice.value ? form.buyerAddress.trim() : '',
      buyer_phone: isSpecialInvoice.value ? form.buyerPhone.trim() : '',
      buyer_bank_name: isSpecialInvoice.value ? form.buyerBankName.trim() : '',
      buyer_bank_account: isSpecialInvoice.value ? form.buyerBankAccount.trim() : '',
    })
    form.invoiceTitle = ''
    form.taxNumber = ''
    form.recipientEmail = ''
    form.invoiceKind = 'ordinary'
    form.buyerAddress = ''
    form.buyerPhone = ''
    form.buyerBankName = ''
    form.buyerBankAccount = ''
    localStorage.removeItem(DRAFT_KEY)
    emit('update:visible', false)
    emit('submitted')
    showToast(notice || createdToast(createdSides(applied)), notice ? 'warning' : 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '提交开票申请失败', 'error')
  } finally {
    submitting.value = false
  }
}

watch(
  () => props.visible,
  (open) => {
    if (open) {
      // 先恢复草稿再用已缓存的汇总补空字段；汇总回来后会再补一次（见 `ensureSummary`）。
      restoreDraft()
      applyPrefill()
      void ensureSummary()
      document.addEventListener('keydown', handleKeydown)
    } else {
      document.removeEventListener('keydown', handleKeydown)
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="invoice-modal-overlay" @click.self="close">
      <article class="invoice-panel invoice-modal" role="dialog" aria-modal="true" :aria-label="copy.title">
        <div class="invoice-panel__head invoice-modal__head">
          <div>
            <span class="invoice-panel__kicker">{{ copy.kicker }}</span>
            <h2>{{ copy.title }}</h2>
          </div>
          <strong>{{ copy.issuer }}</strong>
          <button class="invoice-modal__close" type="button" aria-label="关闭" @click="close">×</button>
        </div>

        <p class="invoice-panel__hint">{{ copy.hint }}</p>
        <p v-if="prefillHint"
          :class="prefillNeedsAttention ? 'invoice-panel__notice' : 'invoice-panel__prefill'">
          {{ prefillHint }}
        </p>

        <div class="invoice-amount" aria-live="polite">
          <span class="invoice-amount__label">可开票金额</span>
          <strong class="invoice-amount__value">
            {{ summaryLoading ? '加载中…' : `¥${amountCny}` }}
          </strong>
          <small class="invoice-amount__note">{{ copy.amountNote }}</small>
          <small v-if="summary" class="invoice-amount__note">
            本需求已成功结算合计 ¥{{ summary.settledAmountCny }}（平台服务费 ¥{{ summary.platformFeeCny }} +
            开发者收入 ¥{{ summary.developerGrossAmountCny }}）
          </small>
          <small v-if="summary && openSides.length > 1" class="invoice-amount__note">
            本次申请一次开出两张：平台服务费票 ¥{{ summary.platformFeeCny }} + 开发者收入票 ¥{{ summary.developerInvoiceCny }}
          </small>
          <small v-if="summary && summary.developerPayoutFen > 0" class="invoice-amount__note">
            其中开发者已退还 / 赔付客户 ¥{{ summary.developerPayoutCny }}，开发者票按净额 ¥{{ summary.developerInvoiceCny }} 开具；平台服务费未退，平台票不受影响。
          </small>
        </div>
        <p v-if="summary && summary.pendingRefundFen > 0" class="invoice-panel__notice">
          本需求有未结案的退款诉求 ¥{{ summary.pendingRefundCny }}（退还还没走完）：
          开发者票已按扣除这笔诉求后的净额 ¥{{ summary.developerInvoiceCny }} 计算——钱还没退出去，
          不能算进已经发生的销售额。诉求判不成立或撤回时，差额再补开；平台服务费不随退款减免。
        </p>
        <p v-for="item in existingInvoices" :key="item.invoice.id" class="invoice-panel__notice">
          {{ invoiceSideLabel(item.side) }}已提交（{{ kindNoticePrefix(item.invoice.invoiceKind) }}{{ invoiceStatusLabel(item.invoice.status) }} · 票面 ¥{{ item.invoice.amountCny }}），到「我的发票」可查看进度与发票文件。
        </p>
        <p v-for="item in staleInvoices" :key="`stale-${item.invoice.id}`" class="invoice-panel__notice">
          原票开具后本需求实际发生的净额变了（售后退款 / 赔付已成立）：{{ invoiceSideLabel(item.side) }}
          需要红冲后重开。财务端已列为「待红冲」，红冲完成后这里就能按最新净额重新申请，无需另行申请改写。
        </p>
        <p v-if="!summaryLoading && summary && amountFen <= 0" class="invoice-panel__hint">
          本需求暂无可开票金额：要么还没有成功分账的结算（未结案的退款诉求会先扣掉这部分），
          要么能开的票都已经提交过了。
        </p>
        <label>
          发票抬头
          <input v-model="form.invoiceTitle" name="invoice_title" type="text" maxlength="200" placeholder="个人姓名、个体户或企业名称" />
        </label>
        <label>
          税号
          <input v-model="form.taxNumber" name="tax_number" type="text" maxlength="64"
            :placeholder="isOrganizationBuyer ? '企业或个体工商户必填' : '个人开票可不填'" />
        </label>
        <label>
          接收邮箱（可选）
          <input v-model="form.recipientEmail" name="recipient_email" type="email" maxlength="254" placeholder="用于接收开票文件" />
        </label>

        <fieldset class="invoice-kind">
          <legend>发票票种</legend>
          <label class="invoice-kind__option" :class="{ 'is-active': !isSpecialInvoice }">
            <input v-model="form.invoiceKind" type="radio" name="invoice-kind" value="ordinary" />
            <span>
              <strong>普通发票</strong>
              <small>默认票种，个人、个体工商户与企业都能开具</small>
            </span>
          </label>
          <label v-if="isSpecialAvailable" class="invoice-kind__option"
            :class="{ 'is-active': isSpecialInvoice }">
            <input v-model="form.invoiceKind" type="radio" name="invoice-kind" value="special" />
            <span>
              <strong>增值税专用发票</strong>
              <small>仅企业可开，需补齐购买方开票资料，可用于抵扣</small>
            </span>
          </label>
          <p v-if="!isSpecialAvailable && buyer" class="invoice-panel__prefill">
            增值税专用发票只对企业主体开具，个人与个体工商户只能开普通发票。
          </p>
        </fieldset>

        <template v-if="isSpecialInvoice">
          <p class="invoice-panel__notice">
            增值税专用发票需要购买方开票资料齐全：名称与纳税人识别号用上方填写的抬头与税号，请照营业执照与开户信息补齐下面四项。
          </p>
          <label>
            注册地址
            <input v-model="form.buyerAddress" name="buyer_address" type="text" maxlength="200" placeholder="照营业执照的住所填写" />
          </label>
          <label>
            联系电话
            <input v-model="form.buyerPhone" name="buyer_phone" type="text" maxlength="32" placeholder="开户银行预留电话" />
          </label>
          <label>
            开户银行
            <input v-model="form.buyerBankName" name="buyer_bank_name" type="text" maxlength="120" placeholder="如：中国工商银行彝良县支行" />
          </label>
          <label>
            银行账号
            <input v-model="form.buyerBankAccount" name="buyer_bank_account" type="text" maxlength="64" placeholder="对公账户账号" />
          </label>
        </template>

        <div class="invoice-modal__actions">
          <button class="invoice-modal__draft" type="button" @click="saveDraft">保存草稿</button>
          <button class="invoice-panel__submit" type="button"
            :disabled="submitting || amountFen <= 0" @click="submit">
            {{ submitting ? '提交中...' : copy.submitText }}
          </button>
        </div>
      </article>
    </div>
  </Teleport>
</template>

<style scoped>
.invoice-panel {
  display: grid;
  gap: 14px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  padding: 18px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
}

.invoice-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.invoice-panel__kicker {
  color: #247f7d;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.invoice-panel h2 {
  margin: 4px 0 0;
}

.invoice-panel__head strong {
  color: #b26b1c;
  font-size: 13px;
}

.invoice-panel__hint {
  color: #667085;
  font-size: 13px;
  line-height: 1.6;
  margin: 0;
}

.invoice-panel__notice {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fffaeb;
  color: #9a6700;
  font-size: 12px;
  line-height: 1.6;
}

/* 自动预填的说明：只是交代抬头/税号从哪来，不抢警示色的注意力。 */
.invoice-panel__prefill {
  margin: 0;
  color: #667085;
  font-size: 12px;
  line-height: 1.6;
}

/* 可开票金额：申请合并成一次动作后它是弹窗里唯一的主角，单独一块摆出来，
   下面几行小字分别是「这笔钱要开成哪几张票」与「本需求结算合计的拆解」。 */
.invoice-amount {
  display: grid;
  gap: 4px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px 14px;
  background: #f8fafc;
}

.invoice-amount__label {
  color: #667085;
  font-size: 12px;
  font-weight: 700;
}

.invoice-amount__value {
  color: #172033;
  font-size: 24px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.invoice-amount__note {
  color: #98a2b3;
  font-size: 12px;
  line-height: 1.5;
}

.invoice-panel__submit {
  border: 0;
  border-radius: 8px;
  padding: 9px 14px;
  background: #247f7d;
  color: #fff;
  cursor: pointer;
}

.invoice-panel__submit:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.invoice-panel label {
  display: grid;
  gap: 6px;
  color: #344054;
  font-size: 13px;
  font-weight: 700;
}

/* 票种：两个卡片式单选项。专票只在买方是企业主体时出现，所以这里是「一张或两张卡片」。
   选择器带 `.invoice-panel` 前缀：`display` 之类要压过上面通用的 `.invoice-panel label`。 */
.invoice-panel .invoice-kind {
  display: grid;
  gap: 8px;
  margin: 0;
  border: 0;
  padding: 0;
}

.invoice-panel .invoice-kind legend {
  margin-bottom: 8px;
  padding: 0;
  color: #344054;
  font-size: 13px;
  font-weight: 700;
}

.invoice-panel .invoice-kind__option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border: 1px solid #d0d5dd;
  border-radius: 9px;
  padding: 10px 12px;
  font-weight: 400;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.invoice-panel .invoice-kind__option:hover {
  border-color: #b7c0cd;
}

.invoice-panel .invoice-kind__option.is-active {
  border-color: #247f7d;
  background: #f4fbfa;
}

.invoice-panel .invoice-kind__option input {
  width: auto;
  min-height: 0;
  margin: 3px 0 0;
  accent-color: #247f7d;
}

.invoice-panel .invoice-kind__option span {
  display: grid;
  gap: 2px;
}

.invoice-panel .invoice-kind__option strong {
  color: #172033;
  font-size: 13px;
}

.invoice-panel .invoice-kind__option small {
  color: #667085;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
}

.invoice-panel input {
  width: 100%;
  min-height: 40px;
  box-sizing: border-box;
  border: 1px solid #d0d5dd;
  border-radius: 7px;
  padding: 8px 10px;
  color: #172033;
  background: #fff;
  font-family: inherit;
  font-size: 14px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.invoice-panel input::placeholder {
  color: #98a2b3;
}

.invoice-panel input:hover {
  border-color: #b7c0cd;
}

.invoice-panel input:focus {
  outline: none;
  border-color: #247f7d;
  box-shadow: 0 0 0 3px rgba(36, 127, 125, 0.14);
}

/* 弹窗遮罩与内容 */
.invoice-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(15, 23, 42, 0.45);
}

.invoice-modal {
  position: relative;
  width: min(480px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
}

.invoice-modal__head {
  padding-right: 28px;
}

.invoice-modal__close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #667085;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.invoice-modal__close:hover {
  background: #f2f4f7;
  color: #172033;
}

.invoice-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 6px;
}

.invoice-modal__draft {
  border: 1px solid #d0d5dd;
  border-radius: 8px;
  padding: 9px 14px;
  background: #fff;
  color: #344054;
  cursor: pointer;
}

.invoice-modal__draft:hover {
  background: #f2f4f7;
}
</style>
