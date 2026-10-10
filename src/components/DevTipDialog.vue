<script setup lang="ts">
/**
 * R010 打赏弹窗。
 *
 * 用于开发者主页（`DevProfileView.vue`）他人视角：选固定档位或自填金额
 * （受公开档案里的上下限约束）、切「现金 / 积分」、留言（≤200 字）、可勾匿名 → 提交。
 *
 * 现金形态对齐 R008：统一按 `client_platform='pc'` 下单，后端回本站中间页 URL
 * （`pay_url` 带 `tip_wechat=1&order_no=&token=`）。在微信内直接跳到该中间页自动唤起 JSAPI；
 * 非微信端展示二维码并轮询 `getTipOrder`，手机扫码后在中间页完成支付。
 * 积分一步到位（后端同事务扣打赏者积分、给开发者净额）。
 */
import { computed, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { TButton, TCheckbox, TDialog, TInput } from 'ui_73info'

import {
  createTip,
  getTipOrder,
  type CreateTipPayload,
  type TipOrder,
} from '@/api/tips'
import type { PublicTipBlock } from '@/api/publicProfile'
import { useToast } from '@/composables/useToast'
import { isWechatBrowser } from '@/shared/auth/browser'
import {
  defaultTipChannel,
  formatTipCashTier,
  formatTipPointsTier,
  TIP_MESSAGE_MAX_LENGTH,
  tipChannelAvailability,
  validateTipCustomCash,
  validateTipCustomPoints,
} from '@/shared/devTip'

const props = defineProps<{
  open: boolean
  /** 被打赏的开发者用户名 */
  username: string
  /** 公开档案里的打赏块 */
  tip: PublicTipBlock | null
  /** 令牌由父组件传入（登录态） */
  token: string
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'success', order: TipOrder): void
}>()

const { showToast } = useToast()

/** 后端未给 notice 时的兜底合规文案（与 `TIP_NATURE_NOTICE` 同口径）。 */
const FALLBACK_NOTICE =
  '打赏是你向平台支付的一笔指定用于支持该开发者的款项，平台按协议扣除服务费后结算给开发者。打赏为自愿支付，常规情况下不支持退款；未成年人未经监护人同意的打赏，监护人可联系平台申诉退款。'

const availability = computed(() => tipChannelAvailability(props.tip))

const channel = ref<'cash' | 'points'>('cash')
/** 选中的固定档位下标；null 表示未选档位（走自填） */
const selectedTierIndex = ref<number | null>(null)
/** 是否使用自填金额（true 时忽略档位） */
const useCustom = ref(false)
const customCash = ref('')
const customPoints = ref('')
const message = ref('')
const anonymous = ref(false)
const submitting = ref(false)
const errorText = ref('')

/** 现金单：本站中间页 URL 生成的二维码 */
const order = ref<TipOrder | null>(null)
const qrDataUrl = ref('')
const payUrl = ref('')
let pollTimer: ReturnType<typeof setInterval> | null = null

const noticeText = computed(() => (props.tip?.notice ?? '').trim() || FALLBACK_NOTICE)
const feePercentText = computed(() => {
  const bps = Number(props.tip?.platform_fee_bps ?? 0)
  if (!Number.isFinite(bps) || bps <= 0) {
    return ''
  }
  return `${(bps / 100).toFixed(2).replace(/\.?0+$/, '')}%`
})

const cashTiers = computed(() => props.tip?.cash_tiers_fen ?? [])
const pointsTiers = computed(() => props.tip?.points_tiers ?? [])
const allowCustomCash = computed(() => Boolean(props.tip?.allow_custom_cash))
const allowCustomPoints = computed(() => Boolean(props.tip?.allow_custom_points))

const cashCustomHint = computed(() => {
  if (!allowCustomCash.value) {
    return ''
  }
  const min = formatTipCashTier(props.tip?.custom_cash_min_fen ?? 0)
  const max = formatTipCashTier(props.tip?.custom_cash_max_fen ?? 0)
  return `可自填 ${min} ~ ${max}`
})

const pointsCustomHint = computed(() => {
  if (!allowCustomPoints.value) {
    return ''
  }
  return `可自填 ${props.tip?.custom_points_min ?? 0} ~ ${props.tip?.custom_points_max ?? 0} 积分`
})

/** 当前会提交的金额文本（用于金额摘要）。 */
const amountPreview = computed(() => {
  if (channel.value === 'cash') {
    const tier = selectedTierIndex.value
    if (!useCustom.value && tier != null) {
      return formatTipCashTier(cashTiers.value[tier])
    }
    const parsed = validateTipCustomCash(customCash.value, props.tip)
    return parsed.ok ? formatTipCashTier(parsed.fen) : '—'
  }
  const tier = selectedTierIndex.value
  if (!useCustom.value && tier != null) {
    return formatTipPointsTier(pointsTiers.value[tier])
  }
  const parsed = validateTipCustomPoints(customPoints.value, props.tip)
  return parsed.ok ? formatTipPointsTier(parsed.fen) : '—'
})

const successVisible = computed(() => order.value?.pay_method === 'cash' && order.value?.status !== 'paid')

function stopPoll() {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function resetState() {
  stopPoll()
  channel.value = defaultTipChannel(availability.value)
  selectedTierIndex.value = availability.value.cash && cashTiers.value.length > 0 ? 0 : null
  useCustom.value = false
  customCash.value = ''
  customPoints.value = ''
  message.value = ''
  anonymous.value = false
  errorText.value = ''
  order.value = null
  qrDataUrl.value = ''
  payUrl.value = ''
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      resetState()
    } else {
      stopPoll()
    }
  },
)

watch(channel, (next) => {
  // 切通道时重置档位选择：现金与积分的档位列表不同
  selectedTierIndex.value =
    (next === 'cash' ? cashTiers.value.length : pointsTiers.value.length) > 0 ? 0 : null
  useCustom.value = false
  errorText.value = ''
})

function pickTier(index: number) {
  selectedTierIndex.value = index
  useCustom.value = false
}

function pickCustom() {
  useCustom.value = true
  selectedTierIndex.value = null
}

function close() {
  if (submitting.value) {
    return
  }
  emit('update:open', false)
}

async function renderQr(url: string) {
  try {
    qrDataUrl.value = await QRCode.toDataURL(url, { width: 220, margin: 1 })
  } catch {
    qrDataUrl.value = ''
  }
}

function pollOnce(orderNo: string) {
  if (!props.token.trim()) {
    return
  }
  void getTipOrder(props.token, orderNo)
    .then((latest) => {
      order.value = latest
      if (latest.status === 'paid') {
        stopPoll()
        showToast('打赏成功，感谢支持', 'success')
        emit('success', latest)
        emit('update:open', false)
      } else if (latest.status === 'failed' || latest.status === 'closed') {
        stopPoll()
        errorText.value = '支付未完成，请重新发起打赏'
      }
    })
    .catch(() => {
      /* 轮询失败不打断扫码流程 */
    })
}

function startPoll(orderNo: string) {
  stopPoll()
  pollOnce(orderNo)
  pollTimer = setInterval(() => pollOnce(orderNo), 4000)
}

/** 构造提交体：优先固定档位，其次自填。 */
function buildPayload(): CreateTipPayload | { error: string } {
  const base: CreateTipPayload = {
    to_username: props.username,
    pay_method: channel.value,
    message: message.value.trim(),
    anonymous: anonymous.value,
  }
  if (channel.value === 'cash') {
    if (!useCustom.value && selectedTierIndex.value != null) {
      return { ...base, tier_index: selectedTierIndex.value }
    }
    const parsed = validateTipCustomCash(customCash.value, props.tip)
    if (!parsed.ok) {
      return { error: parsed.message }
    }
    // 现金：统一按 PC 下单，后端回本站中间页 URL
    return { ...base, amount_fen: parsed.fen, pay_channel: 'wx_pub', client_platform: 'pc' }
  }
  if (!useCustom.value && selectedTierIndex.value != null) {
    return { ...base, tier_index: selectedTierIndex.value }
  }
  const parsed = validateTipCustomPoints(customPoints.value, props.tip)
  if (!parsed.ok) {
    return { error: parsed.message }
  }
  return { ...base, amount_points: parsed.fen }
}

async function submit() {
  if (submitting.value) {
    return
  }
  errorText.value = ''
  if (!props.token.trim()) {
    errorText.value = '请先登录后再打赏'
    return
  }
  const messageText = message.value.trim()
  if (Array.from(messageText).length > TIP_MESSAGE_MAX_LENGTH) {
    errorText.value = `留言不能超过 ${TIP_MESSAGE_MAX_LENGTH} 字`
    return
  }
  const built = buildPayload()
  if ('error' in built) {
    errorText.value = built.error
    return
  }

  submitting.value = true
  try {
    const created = await createTip(props.token, built)
    order.value = created
    if (created.pay_method === 'points' || created.status === 'paid') {
      showToast('打赏成功，感谢支持', 'success')
      emit('success', created)
      emit('update:open', false)
      return
    }
    const url = (created.pay_url ?? '').trim()
    if (!url) {
      errorText.value = '订单已创建，但未取到支付信息，请稍后在「我的已购」类记录中查看'
      return
    }
    payUrl.value = url
    if (isWechatBrowser()) {
      // 微信内：跳到本站中间页，由 PaymentView 自动完成授权并唤起 JSAPI
      window.location.assign(url)
      return
    }
    await renderQr(url)
    startPoll(created.order_no)
  } catch (err) {
    // 后端拒绝的具体原因原样展示（例如「该开发者尚未绑定可用的结算账户」），不吞成「操作失败」
    errorText.value = err instanceof Error ? err.message : '发起打赏失败'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <TDialog
    :open="open"
    class="tip-dialog"
    :title="`打赏 ${username}`"
    width="480px"
    :mask-closable="false"
    @update:open="emit('update:open', $event)"
    @close="stopPoll"
  >
    <!-- 支付中：二维码 / 微信内跳转 -->
    <div v-if="successVisible" class="tip-dialog__pay">
      <p class="tip-dialog__pay-amount">{{ amountPreview }}</p>
      <template v-if="qrDataUrl">
        <img :src="qrDataUrl" alt="打赏支付二维码" class="tip-dialog__qr" width="220" height="220" />
        <p class="tip-dialog__pay-tip">请用手机微信扫码，在手机上完成支付；支付完成后本窗口会自动更新。</p>
      </template>
      <template v-else-if="payUrl">
        <p class="tip-dialog__pay-tip">请点击下方按钮在微信中完成支付。</p>
        <a class="tip-dialog__pay-link" :href="payUrl">打开微信支付页</a>
      </template>
      <template v-else>
        <p class="tip-dialog__pay-tip">正在获取支付二维码…</p>
      </template>
      <p v-if="errorText" class="tip-dialog__error" role="alert">{{ errorText }}</p>
    </div>

    <!-- 表单 -->
    <div v-else class="tip-dialog__body">
      <p v-if="tip?.thanks_message" class="tip-dialog__thanks">{{ tip.thanks_message }}</p>

      <!-- 通道切换：只显示对方开启的通道 -->
      <div v-if="availability.cash && availability.points" class="tip-dialog__channels" role="radiogroup" aria-label="打赏方式">
        <button
          type="button"
          class="tip-dialog__channel"
          :class="{ 'is-active': channel === 'cash' }"
          :aria-pressed="channel === 'cash'"
          @click="channel = 'cash'"
        >
          现金打赏
        </button>
        <button
          type="button"
          class="tip-dialog__channel"
          :class="{ 'is-active': channel === 'points' }"
          :aria-pressed="channel === 'points'"
          @click="channel = 'points'"
        >
          积分打赏
        </button>
      </div>

      <!-- 现金档位 -->
      <template v-if="channel === 'cash'">
        <div v-if="cashTiers.length" class="tip-dialog__tiers">
          <button
            v-for="(tier, index) in cashTiers"
            :key="`cash-${index}`"
            type="button"
            class="tip-dialog__tier"
            :class="{ 'is-active': !useCustom && selectedTierIndex === index }"
            @click="pickTier(index)"
          >
            {{ formatTipCashTier(tier) }}
          </button>
        </div>
        <button
          v-if="allowCustomCash"
          type="button"
          class="tip-dialog__custom-toggle"
          :class="{ 'is-active': useCustom }"
          @click="pickCustom"
        >
          自填金额
        </button>
        <div v-if="useCustom" class="tip-dialog__field">
          <label class="tip-dialog__label" for="tip-custom-cash">自定义金额（元）</label>
          <TInput id="tip-custom-cash" v-model="customCash" placeholder="请输入金额" />
          <span v-if="cashCustomHint" class="tip-dialog__hint">{{ cashCustomHint }}</span>
        </div>
      </template>

      <!-- 积分档位 -->
      <template v-else>
        <div v-if="pointsTiers.length" class="tip-dialog__tiers">
          <button
            v-for="(tier, index) in pointsTiers"
            :key="`points-${index}`"
            type="button"
            class="tip-dialog__tier"
            :class="{ 'is-active': !useCustom && selectedTierIndex === index }"
            @click="pickTier(index)"
          >
            {{ formatTipPointsTier(tier) }}
          </button>
        </div>
        <button
          v-if="allowCustomPoints"
          type="button"
          class="tip-dialog__custom-toggle"
          :class="{ 'is-active': useCustom }"
          @click="pickCustom"
        >
          自填积分
        </button>
        <div v-if="useCustom" class="tip-dialog__field">
          <label class="tip-dialog__label" for="tip-custom-points">自定义积分</label>
          <TInput id="tip-custom-points" v-model="customPoints" placeholder="请输入积分" />
          <span v-if="pointsCustomHint" class="tip-dialog__hint">{{ pointsCustomHint }}</span>
        </div>
      </template>

      <div class="tip-dialog__field">
        <label class="tip-dialog__label" for="tip-message">留言（可选）</label>
        <TInput
          id="tip-message"
          v-model="message"
          type="textarea"
          :rows="3"
          :maxlength="TIP_MESSAGE_MAX_LENGTH"
          placeholder="给开发者说点什么"
        />
        <span class="tip-dialog__hint">{{ Array.from(message).length }} / {{ TIP_MESSAGE_MAX_LENGTH }} 字</span>
      </div>

      <TCheckbox v-model="anonymous" label="匿名打赏（不在公开记录里显示我的用户名）" />

      <p class="tip-dialog__summary">
        本次打赏 <strong>{{ amountPreview }}</strong>
        <template v-if="channel === 'cash' && feePercentText">，平台服务费 {{ feePercentText }}</template>
      </p>

      <p class="tip-dialog__notice">
        {{ noticeText }}
      </p>

      <p v-if="errorText" class="tip-dialog__error" role="alert">{{ errorText }}</p>
    </div>

    <template #footer>
      <template v-if="successVisible">
        <TButton @click="close">关闭</TButton>
      </template>
      <template v-else>
        <TButton :disabled="submitting" @click="close">取消</TButton>
        <TButton
          variant="solid"
          tone="accent"
          :loading="submitting"
          :disabled="!availability.cash && !availability.points"
          @click="submit"
        >
          确认打赏
        </TButton>
      </template>
    </template>
  </TDialog>
</template>

<style scoped>
.tip-dialog__body {
  display: grid;
  gap: 14px;
}

.tip-dialog__thanks {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(239, 246, 255, 0.8);
  color: #334155;
  font-size: 13px;
  line-height: 1.6;
}

.tip-dialog__channels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.tip-dialog__channel {
  padding: 8px 12px;
  border: 1px solid #dbe4f0;
  border-radius: 10px;
  background: #fff;
  color: #475569;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    color 0.18s ease;
}

.tip-dialog__channel.is-active {
  border-color: #2563eb;
  background: #eff6ff;
  color: #2563eb;
}

.tip-dialog__tiers {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tip-dialog__tier {
  min-width: 76px;
  padding: 8px 12px;
  border: 1px solid #dbe4f0;
  border-radius: 10px;
  background: #fff;
  color: #0f172a;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    color 0.18s ease;
}

.tip-dialog__tier.is-active {
  border-color: #2563eb;
  background: #eff6ff;
  color: #2563eb;
}

.tip-dialog__custom-toggle {
  justify-self: start;
  padding: 4px 10px;
  border: 1px dashed #c7d2fe;
  border-radius: 999px;
  background: transparent;
  color: #4f46e5;
  font-size: 12px;
  cursor: pointer;
}

.tip-dialog__custom-toggle.is-active {
  border-style: solid;
  background: #eef2ff;
}

.tip-dialog__field {
  display: grid;
  gap: 6px;
}

.tip-dialog__label {
  color: #334155;
  font-size: 13px;
  font-weight: 700;
}

.tip-dialog__hint {
  color: #94a3b8;
  font-size: 12px;
}

.tip-dialog__summary {
  margin: 0;
  color: #475569;
  font-size: 13px;
}

.tip-dialog__summary strong {
  color: #9a3412;
  font-size: 16px;
}

.tip-dialog__notice {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(191, 219, 254, 0.85);
  background: rgba(248, 250, 252, 0.9);
  color: #64748b;
  font-size: 12px;
  line-height: 1.7;
}

.tip-dialog__error {
  margin: 0;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid rgba(252, 165, 165, 0.85);
  background: rgba(254, 242, 242, 0.9);
  color: #b91c1c;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
}

.tip-dialog__pay {
  display: grid;
  justify-items: center;
  gap: 12px;
  padding: 8px 0;
  text-align: center;
}

.tip-dialog__pay-amount {
  margin: 0;
  color: #9a3412;
  font-size: 26px;
  font-weight: 800;
}

.tip-dialog__qr {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
}

.tip-dialog__pay-tip {
  margin: 0;
  color: #475569;
  font-size: 13px;
  line-height: 1.6;
}

.tip-dialog__pay-link {
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  border-radius: 10px;
  background: #2563eb;
  color: #fff;
  font-weight: 700;
  text-decoration: none;
}
</style>
