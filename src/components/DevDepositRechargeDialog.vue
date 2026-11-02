<script setup lang="ts">
/**
 * 开发者保证金充值弹窗。
 *
 * 工作台总览的「保证金不足」提示与收益钱包的「充值」按钮共用同一个弹窗，
 * 避免两处各写一份表单与下单逻辑。
 *
 * 版面按线上口径（标题「保证金充值」/ 520px / 金额 + 信用说明 + 支付方式 / 「充值」）：
 * - 信用额度那一行回答「我还能充多少」，由 `GET /api/credit/credit/me` 给出；
 *   查不到就不展示，也不阻断充值（真正的拦截在后端）；
 * - 支付方式只在「本机装了哪些渠道」里选，默认支付宝。
 *
 * 样式复用全局 `.dev-recharge-dialog*`（在 `styles/dev-wallet.css`），本组件不带 style 块。
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { useRouter } from 'vue-router'

import { getDevCreditSelf, type DevCreditSelf } from '@/api/devCredit'
import {
  createPrepaidRecharge,
  getPrepaidWechatAuthUrl,
  getPrepaidWechatStatus,
} from '@/api/devOrderDeposit'
import { toFen } from '@/composables/useDevWalletDeposit'
import { useAuthStore } from '@/stores/auth'

import {
  TAlert,
  TButton,
  TDialog,
  TForm,
  TFormItem,
  TInputNumber,
  TMessage,
  TRadioButton,
  TRadioGroup,
} from 'ui_73info'

const emit = defineEmits<{
  (event: 'succeeded'): void
}>()

const auth = useAuthStore()
const router = useRouter()

const visible = ref(false)
const submitting = ref(false)
/** 充值金额（元）：默认 100，与线上一致 */
const amount = ref(100)
const channel = ref<'alipay' | 'wechat'>('alipay')
/** 二维码对应的渠道：微信是「扫码打开平台中间页」，与支付宝的收银台链接不是一个东西 */
const qrChannel = ref<'alipay' | 'wechat'>('alipay')
/** 信用额度：只用来解释「还能充多少」，查不到不阻断充值 */
const creditInfo = ref<DevCreditSelf | null>(null)
/** 下单后拿到的收银台地址渲染成的二维码（dataURL）；空串 = 还在填表单 */
const qrDataUrl = ref('')
/** 当前待支付的充值单号，展示给用户对账 */
const pendingOrderNo = ref('')
/** 微信支付的轮询定时器：PC 出码后盯到账，不用用户自己猜 */
let pollTimer: number | null = null

const amountFen = computed(() => toFen(amount.value))
/** 超过信用允许的额度：后端会拒绝，这里先说清原因，别等提交才报错 */
const overCreditCap = computed(() => {
  const credit = creditInfo.value
  return Boolean(
    credit?.enforce_deposit_limit && amountFen.value > credit.remaining_deposit_cap_fen,
  )
})

const money = (fen?: number | null) => `¥${((fen ?? 0) / 100).toFixed(2)}`

async function open(): Promise<void> {
  amount.value = 100
  channel.value = 'alipay'
  qrChannel.value = 'alipay'
  creditInfo.value = null
  backToForm()
  if (auth.token) {
    creditInfo.value = await getDevCreditSelf(auth.token).catch(() => null)
  }
  visible.value = true
}

/** 微信中间页地址：手机扫码打开后完成公众号授权与 JSAPI 支付。 */
function prepaidMiddlePageUrl(orderNo: string): string {
  const resolved = router.resolve({
    name: 'prepaid-wechat-pay',
    query: { order_no: orderNo, token: auth.token },
  })
  return new URL(resolved.href, window.location.origin).toString()
}

/** 停掉微信充值的到账轮询。 */
function stopPolling(): void {
  if (pollTimer !== null) {
    window.clearTimeout(pollTimer)
    pollTimer = null
  }
}

/**
 * 微信充值出码后盯订单状态：回调可能晚到，用户不该靠自己猜「付成功了没有」。
 * 到账即关闭弹窗并通知父级回刷余额；失败 / 关闭则回到表单让用户重下。
 */
function startPolling(orderNo: string): void {
  stopPolling()
  const tick = async () => {
    pollTimer = null
    try {
      // 用中间页的 status 端点：它会在挂起时向渠道对一次账，
      // 回调晚到 / 丢失时也能把「已支付」补上（普通查单只看本地状态）。
      const status = await getPrepaidWechatStatus(orderNo, auth.token)
      const order = status.order
      if (order.status === 'paid') {
        TMessage.success('充值成功，保证金余额已到账')
        visible.value = false
        backToForm()
        emit('succeeded')
        return
      }
      if (order.status === 'failed' || order.status === 'canceled') {
        TMessage.error('充值单已关闭或支付失败，请重新发起')
        backToForm()
        return
      }
    } catch {
      /* 轮询失败不打断，下一次继续 */
    }
    pollTimer = window.setTimeout(tick, 3000)
  }
  pollTimer = window.setTimeout(tick, 3000)
}

async function submit(): Promise<void> {
  if (submitting.value) {
    return
  }
  if (!Number.isFinite(amount.value) || amount.value <= 0 || amountFen.value < 1) {
    TMessage.warning('请输入有效的充值金额')
    return
  }
  submitting.value = true
  try {
    const order = await createPrepaidRecharge(auth.token, {
      amount_fen: amountFen.value,
      channel: channel.value,
      client_platform: 'pc',
    })
    if (channel.value === 'wechat') {
      // 微信下单只落了本地单（还没有 openid，渠道不受理）。二维码里放**平台中间页**：
      // 手机微信扫码打开 → 公众号静默授权拿 openid → 补建渠道单并拉起支付。
      // 不能把渠道参数画成二维码——JSAPI 参数包在普通扫码里拉不起微信支付。
      const middlePage = prepaidMiddlePageUrl(order.order_no)
      const authUrl = await getPrepaidWechatAuthUrl(order.order_no, auth.token, middlePage)
      const qrContent = authUrl.authorized || !authUrl.url.trim() ? middlePage : authUrl.url
      qrDataUrl.value = await QRCode.toDataURL(qrContent, {
        width: 220,
        margin: 1,
        errorCorrectionLevel: 'M',
      })
      qrChannel.value = 'wechat'
      pendingOrderNo.value = order.order_no
      startPolling(order.order_no)
      return
    }
    // 后端 `client_action` 的字段是 `redirect_url` / `qr_code` /
    // `sdk_payload`（见 payment_provider 的 `ClientAction`）。
    // 早先这里读的是 `pay_url`——那个字段不存在，所以支付页永远打不开。
    //
    // 拿到地址后**不跳转**，就地渲染成二维码：PC 端是「主扫」场景，
    // 用户要的是拿手机扫屏幕上的码。直接 `location.href` 跳过去，
    // 桌面浏览器打开的是支付宝的 H5 页（甚至只是它的首页），用户反而不知道在付什么。
    const action = order.client_action as {
      redirect_url?: string | null
      qr_code?: string | null
      sdk_payload?: { pay_info?: string } | null
    } | null
    const payUrl = action?.redirect_url || action?.sdk_payload?.pay_info || ''
    if (!payUrl) {
      TMessage.success('充值单已创建，请完成支付')
      emit('succeeded')
      return
    }
    qrDataUrl.value = await QRCode.toDataURL(payUrl, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: 'M',
    })
    qrChannel.value = 'alipay'
    pendingOrderNo.value = order.order_no
    // 停在当前弹窗展示二维码，用户扫完由父级回刷余额。
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '创建充值订单失败')
  } finally {
    submitting.value = false
  }
}

/** 关闭二维码视图，回到表单（换金额重下另一单）。 */
function backToForm() {
  stopPolling()
  qrDataUrl.value = ''
  pendingOrderNo.value = ''
}

/** 用户点「我已支付」：关掉弹窗并通知父级回刷余额。 */
function closeAfterPay() {
  visible.value = false
  backToForm()
  emit('succeeded')
}

onUnmounted(stopPolling)

// 弹窗被右上角关掉时也要停轮询：组件一直挂在页面上，
// 不停的话会在用户已经离开后继续查单并弹「充值成功」。
watch(visible, (open) => {
  if (!open) {
    stopPolling()
  }
})

defineExpose({ open })
</script>

<template>
  <TDialog v-model:open="visible" title="保证金充值" width="520px" class="dev-recharge-dialog">
    <!-- 下单成功后：就地展示二维码（PC 主扫），不跳转 -->
    <div v-if="qrDataUrl" class="dev-recharge-dialog__qr">
      <p class="dev-recharge-dialog__qr-hint">
        {{
          qrChannel === 'wechat'
            ? '请用微信扫描下方二维码完成支付'
            : '请用支付宝扫描下方二维码完成支付'
        }}
      </p>
      <img
        :src="qrDataUrl"
        :alt="qrChannel === 'wechat' ? '微信支付二维码' : '支付宝支付二维码'"
        class="dev-recharge-dialog__qr-img"
      />
      <p class="dev-recharge-dialog__qr-order">订单号：{{ pendingOrderNo }}</p>
      <p class="dev-recharge-dialog__qr-note">
        支付完成后点下方「我已支付」刷新余额；若余额未变，稍等片刻再刷新。
      </p>
    </div>

    <TForm v-else class="dev-recharge-dialog__form" label-position="top">
      <TFormItem label="充值金额（元）" required>
        <TInputNumber
          v-model="amount"
          class="dev-recharge-dialog__amount-input"
          :min="0.01"
          :precision="2"
          :step="0.01"
        />
        <div class="dev-recharge-dialog__notes">
          <div class="dev-wallet-withdraw__note">充值后保证金余额增加，可用于解锁接单资格。</div>
          <div
            v-if="creditInfo && creditInfo.enforce_deposit_limit"
            class="dev-wallet-withdraw__note"
          >
            当前信用 {{ creditInfo.credit_score.toFixed(2) }}（按 1 信用 = ¥{{
              (creditInfo.fen_per_credit / 100).toFixed(2)
            }}
            折算），还可充 <strong>{{ money(creditInfo.remaining_deposit_cap_fen) }}</strong
            >。
          </div>
        </div>
        <TAlert
          v-if="overCreditCap"
          class="dev-recharge-dialog__limit-alert"
          tone="warning"
          :closable="false"
          show-icon
          title="充值金额超过当前信用允许的额度，提交将被拒绝。请联系管理员提升信用，或下调充值金额。"
        />
      </TFormItem>
      <TFormItem label="支付方式" required>
        <TRadioGroup v-model="channel" class="dev-recharge-dialog__channels">
          <TRadioButton value="alipay" class="dev-recharge-dialog__channel--alipay">
            <img
              src="/icons/alipay.png"
              class="dev-recharge-dialog__channel-icon"
              width="22"
              height="22"
              alt=""
            />
            <span>支付宝</span>
          </TRadioButton>
          <TRadioButton value="wechat" class="dev-recharge-dialog__channel--wechat">
            <img
              src="/icons/wechat-pay.png"
              class="dev-recharge-dialog__channel-icon"
              width="22"
              height="22"
              alt=""
            />
            <span>微信</span>
          </TRadioButton>
        </TRadioGroup>
      </TFormItem>
    </TForm>
    <template #footer>
      <template v-if="qrDataUrl">
        <TButton class="dev-recharge-dialog__action" @click="backToForm">重新充值</TButton>
        <TButton
          variant="solid"
          tone="accent"
          class="dev-recharge-dialog__action"
          @click="closeAfterPay"
        >
          我已支付
        </TButton>
      </template>
      <template v-else>
        <TButton class="dev-recharge-dialog__action" @click="visible = false">取消</TButton>
        <TButton
          variant="solid"
          tone="accent"
          class="dev-recharge-dialog__action"
          :loading="submitting"
          :disabled="overCreditCap"
          @click="submit"
        >
          充值
        </TButton>
      </template>
    </template>
  </TDialog>
</template>

<style scoped>
/* 二维码视图：居中一张码 + 订单号 + 提示，用户扫完点「我已支付」。
   尺寸固定 220px：支付宝码本身是 220×220，放大反而糊。 */
.dev-recharge-dialog__qr {
  display: grid;
  justify-items: center;
  gap: 12px;
  padding: 8px 0 4px;
}

.dev-recharge-dialog__qr-hint {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--dev-ink);
}

.dev-recharge-dialog__qr-img {
  width: 220px;
  height: 220px;
  border: 1px solid var(--dev-line);
  border-radius: 12px;
  background: var(--73-surface-strong);
}

.dev-recharge-dialog__qr-order,
.dev-recharge-dialog__qr-note {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--dev-muted);
  text-align: center;
  overflow-wrap: anywhere;
}
</style>
