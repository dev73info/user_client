import { computed, onMounted, reactive, ref } from 'vue'

import {
  getTipSettings,
  listReceivedTips,
  updateTipSettings,
  type TipConfig,
  type TipOrder,
  type TipSettingsPayload,
} from '@/api/tips'
import { useAuthStore } from '@/stores/auth'
import {
  TIP_THANKS_MAX_LENGTH,
  validateTipCashTiers,
  validateTipCustomCashRange,
} from '@/shared/devTip'
import { formatFenAsCny } from '@/shared/money'

import { TMessage } from 'ui_73info'

/**
 * 打赏表单的字段。
 *
 * 金额这一层有**两种表示**，别混：`cashTiers` / `customCashMin` / `customCashMax` 是输入框里
 * 的**元文本**（用户直接编辑的字符串），提交前统一换成整数分；其余字段与契约
 * `UpdateTipConfigRequest` 一一对应。契约里没有积分档位与手续费，所以没有对应字段。
 */
export type DevTipSettingsForm = {
  enabled: boolean
  /** 固定档位（元文本，提交时换成分） */
  cashTiers: string[]
  allowCustomCash: boolean
  /** 自填下限（元文本） */
  customCashMin: string
  /** 自填上限（元文本） */
  customCashMax: string
  thanksMessage: string
  publicRecords: boolean
}

/**
 * R010「打赏设置」页的取数与表单域：打赏设置（开关 / 现金档位 / 自填上下限 / 感谢语 /
 * 公开记录）、保存前的本地校验（与后端 `normalize_settings` 同口径）、收到打赏列表与累计读数。
 *
 * 只有现金一种形态：契约的 `TipConfigResponse` 没有积分档位、没有分通道开关、也没有
 * 平台服务费基点与结算账户标记，这些一律不再读（读出来恒为假值，页面会显示错的东西）。
 */
export function useDevTipSettings() {
  const auth = useAuthStore()

  const loading = ref(false)
  const saving = ref(false)
  const settingsLoaded = ref(false)

  const form = reactive<DevTipSettingsForm>({
    enabled: false,
    cashTiers: [] as string[],
    allowCustomCash: true,
    customCashMin: '1.00',
    customCashMax: '20000.00',
    thanksMessage: '',
    publicRecords: false,
  })

  const received = ref<TipOrder[]>([])
  const receivedLoading = ref(false)

  /** 累计现金收入（整数分，只算已支付的单）。 */
  const receivedCashTotal = computed(() =>
    received.value
      .filter((item) => item.status === 'paid')
      .reduce((sum, item) => sum + item.amount_fen, 0),
  )
  /** 累计现金文案：分 → 元由 `@/shared/money` 统一转换。 */
  const receivedCashText = computed(() => `¥${formatFenAsCny(receivedCashTotal.value)}`)

  function fillForm(settings: TipConfig) {
    form.enabled = settings.enabled
    form.cashTiers = (settings.cash_tiers_fen ?? []).map((fen) => formatFenAsCny(fen))
    form.allowCustomCash = settings.allow_custom_cash
    form.customCashMin = formatFenAsCny(settings.custom_cash_min_fen)
    form.customCashMax = formatFenAsCny(settings.custom_cash_max_fen)
    form.thanksMessage = settings.thanks_message ?? ''
    form.publicRecords = settings.public_records
  }

  async function loadSettings() {
    auth.hydrate()
    if (!auth.token.trim()) {
      return
    }
    loading.value = true
    try {
      fillForm(await getTipSettings(auth.token))
      settingsLoaded.value = true
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '加载打赏设置失败')
    } finally {
      loading.value = false
    }
  }

  async function loadReceived() {
    auth.hydrate()
    if (!auth.token.trim()) {
      return
    }
    receivedLoading.value = true
    try {
      received.value = await listReceivedTips(auth.token)
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '加载收到打赏失败')
    } finally {
      receivedLoading.value = false
    }
  }

  /** 本地校验（与后端 `normalize_settings` 同口径），返回错误文案或 null。 */
  function validateForm(): string | null {
    if (Array.from(form.thanksMessage).length > TIP_THANKS_MAX_LENGTH) {
      return `感谢语不能超过 ${TIP_THANKS_MAX_LENGTH} 字`
    }
    const cashTiers = validateTipCashTiers(form.cashTiers)
    if (!cashTiers.ok) {
      return cashTiers.message
    }
    const cashRange = validateTipCustomCashRange(form.customCashMin, form.customCashMax)
    if (!cashRange.ok) {
      return cashRange.message
    }
    return null
  }

  /**
   * 提交体（契约 `UpdateTipConfigRequest`）：金额一律整数分。
   *
   * 只在 `validateForm()` 通过后调用；档位 / 区间取回换算结果时仍做了兜底，
   * 免得校验与构造两处口径漂移时发出去一个 `NaN`。
   */
  function buildPayload(): TipSettingsPayload {
    const cashTiers = validateTipCashTiers(form.cashTiers)
    const cashRange = validateTipCustomCashRange(form.customCashMin, form.customCashMax)
    return {
      enabled: form.enabled,
      cash_tiers_fen: cashTiers.ok ? cashTiers.tiers : [],
      allow_custom_cash: form.allowCustomCash,
      custom_cash_min_fen: cashRange.ok ? cashRange.minFen : 100,
      custom_cash_max_fen: cashRange.ok ? cashRange.maxFen : 2_000_000,
      thanks_message: form.thanksMessage.trim(),
      public_records: form.publicRecords,
    }
  }

  async function save() {
    if (saving.value) {
      return
    }
    auth.hydrate()
    if (!auth.token.trim()) {
      TMessage.warning('请先登录')
      return
    }
    const error = validateForm()
    if (error) {
      TMessage.error(error)
      return
    }
    saving.value = true
    try {
      fillForm(await updateTipSettings(auth.token, buildPayload()))
      TMessage.success('打赏设置已保存')
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '保存打赏设置失败')
    } finally {
      saving.value = false
    }
  }

  /**
   * 刷新打赏设置与收到打赏两块数据。
   *
   * 模板里不能直接写 `Promise.all(...)`：`<script setup>` 的模板作用域只暴露组件实例上的绑定，
   * 全局 `Promise` 不在其中（`vue-tsc` 报 TS2339）。
   */
  function refreshAll() {
    void Promise.all([loadSettings(), loadReceived()])
  }

  onMounted(() => {
    void Promise.all([loadSettings(), loadReceived()])
  })

  return {
    loading,
    saving,
    settingsLoaded,
    form,
    received,
    receivedLoading,
    receivedCashTotal,
    receivedCashText,
    save,
    refreshAll,
  }
}
