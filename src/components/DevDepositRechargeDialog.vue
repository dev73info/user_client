<script setup lang="ts">
/**
 * 开发者保证金充值弹窗。
 *
 * 从收益钱包页提出来的公共窗口：工作台总览的「保证金不足」提示与收益钱包的「充值」按钮
 * 共用同一个弹窗，避免两处各写一份表单与下单逻辑。
 *
 * 弹窗自己负责前置校验与信用额度查询，所以调用方只需要拿到 ref 调 `open()`。
 * 样式复用全局的 `.dev-recharge-dialog*`（在 styles/dev-wallet.css，由 main.ts 全局引入），
 * 因此本组件不需要自己的 style 块。
 */
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { createAdapayDeveloperDepositPayment, getAdapayClientPlatform } from '@/api/adapay'
import { getDevAccessStatus } from '@/api/auth'
import { getDevCreditSelf, type DevCreditSelf } from '@/api/devCredit'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const { showToast } = useToast()

const visible = ref(false)
const amount = ref(100)
const channel = ref<'alipay' | 'wechat'>('alipay')
const submitting = ref(false)
/** 信用额度决定单次可充值上限，只在打开弹窗时拉一次；查不到不阻断充值，由后端兜底拦截 */
const creditInfo = ref<DevCreditSelf | null>(null)

/** 打开弹窗：协议未签时先引导签约，通过后再展示表单 */
async function open(): Promise<void> {
  if (!(await ensureDeveloperAgreement())) {
    return
  }
  amount.value = 100
  creditInfo.value = null
  if (auth.token) {
    creditInfo.value = await getDevCreditSelf(auth.token).catch(() => null)
  }
  visible.value = true
}

function goSignDeveloperAgreement(): void {
  void router.push({
    name: 'contract-sign',
    query: { agreement: 'developer', redirect_to: route.fullPath },
  })
}

/** 未签《开发者入驻协议》时后端会拒绝充值，所以先在客户端拦一次并给出签约出口 */
async function ensureDeveloperAgreement(): Promise<boolean> {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return false
  }
  try {
    const status = await getDevAccessStatus(auth.token)
    if (!status.developer_agreement_signed) {
      showToast('请先签署《开发者入驻协议》后再缴纳保证金', 'warning')
      goSignDeveloperAgreement()
      return false
    }
  } catch {
    // 状态查询失败时交由后端充值接口兜底拦截
  }
  return true
}

/** 微信渠道由支付页唤起，支付宝渠道先下单再带支付参数跳支付页 */
async function startRecharge(): Promise<void> {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }
  if (!(await ensureDeveloperAgreement())) {
    return
  }
  if (!Number.isFinite(amount.value) || amount.value <= 0) {
    showToast('请输入有效的充值金额', 'warning')
    return
  }
  submitting.value = true
  try {
    const amountCny = normalizeCnyAmount(Number(amount.value))
    const clientPlatform = getAdapayClientPlatform()
    if (channel.value === 'wechat') {
      visible.value = false
      await router.push({
        name: 'payment',
        query: {
          adapay: '1',
          developer_deposit: '1',
          intent: '1',
          channel: 'wechat',
          client_platform: clientPlatform,
          amount_cny: amountCny,
        },
      })
      return
    }
    const payment = await createAdapayDeveloperDepositPayment(
      auth.token,
      amountCny,
      channel.value,
      clientPlatform,
    )
    visible.value = false
    await router.push({
      name: 'payment',
      query: {
        adapay: '1',
        developer_deposit: '1',
        payment_id: payment.paymentId,
        channel: payment.payChannel,
        client_platform: clientPlatform,
        amount_cny: payment.amountCny,
        qr_content: payment.payUrl ?? undefined,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建保证金充值订单失败'
    showToast(message, 'error')
  } finally {
    submitting.value = false
  }
}

// 与各开发者页面一致的小工具：金额展示与两位小数归一
function money(value?: number | null) {
  if (value == null) {
    return '¥0.00'
  }

  return `¥${value.toFixed(2)}`
}

function normalizeCnyAmount(value: number) {
  return Math.round(value * 100) / 100
}

defineExpose({ open })
</script>

<template>
  <el-dialog v-model="visible" title="保证金充值" width="520px" class="dev-recharge-dialog" align-center>
    <el-form class="dev-recharge-dialog__form" label-position="top">
      <el-form-item label="充值金额（元）" required>
        <el-input-number v-model="amount" class="dev-recharge-dialog__amount-input" :min="0.01"
          :precision="2" :step="0.01" />
        <div class="dev-recharge-dialog__notes">
          <div class="dev-wallet-withdraw__note">充值后保证金余额增加，可用于解锁接单资格。</div>
          <div v-if="creditInfo && creditInfo.enforce_deposit_limit" class="dev-wallet-withdraw__note">
            当前信用 {{ creditInfo.credit_score.toFixed(2) }}（按 1 信用 = ¥{{
              creditInfo.cny_per_credit.toFixed(2)
            }}
            折算），还可充 <strong>{{ money(creditInfo.remaining_deposit_cap_cny) }}</strong>。
          </div>
        </div>
        <el-alert v-if="
          creditInfo &&
          creditInfo.enforce_deposit_limit &&
          amount > creditInfo.remaining_deposit_cap_cny
        " class="dev-recharge-dialog__limit-alert" type="warning" :closable="false" show-icon
          title="充值金额超过当前信用允许的额度，提交将被拒绝。请联系管理员提升信用，或下调充值金额。" />
      </el-form-item>
      <el-form-item label="支付方式" required>
        <el-radio-group v-model="channel" class="dev-recharge-dialog__channels">
          <el-radio-button value="alipay" class="dev-recharge-dialog__channel--alipay">
            <img src="/icons/alipay.png" class="dev-recharge-dialog__channel-icon" width="22" height="22" alt="" />
            <span>支付宝</span>
          </el-radio-button>
          <el-radio-button value="wechat" class="dev-recharge-dialog__channel--wechat">
            <img src="/icons/wechat-pay.png" class="dev-recharge-dialog__channel-icon" width="22" height="22" alt="" />
            <span>微信</span>
          </el-radio-button>
        </el-radio-group>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button class="dev-recharge-dialog__action" @click="visible = false">取消</el-button>
      <el-button class="dev-recharge-dialog__action" type="primary" :loading="submitting" @click="startRecharge">充值</el-button>
    </template>
  </el-dialog>
</template>
