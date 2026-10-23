import { computed, onMounted, reactive, ref } from 'vue'

import {
  getTipSettings,
  listReceivedTips,
  updateTipSettings,
  type TipOrder,
  type TipSettings,
  type TipSettingsResponse,
} from '@/api/tips'
import { useAuthStore } from '@/stores/auth'
import {
  TIP_THANKS_MAX_LENGTH,
  validateTipCashTiers,
  validateTipCustomCashRange,
  validateTipCustomPointsRange,
  validateTipPointsTiers,
} from '@/shared/devTip'
import { fenToYuanText } from '@/shared/resourceSale'

import { TMessage } from 'ui_73info'

/** 一次取回本页全部收到打赏（后端单页上限 100 条），前端分页。 */
const RECEIVED_FETCH_LIMIT = 100

/** 打赏表单的字段（与后端 `TipSettings` 一一对应，金额单位在这里是元 / 分之间的展示态）。 */
export type DevTipSettingsForm = {
  enabled: boolean
  cashEnabled: boolean
  pointsEnabled: boolean
  cashTiers: string[]
  pointsTiers: number[]
  allowCustomCash: boolean
  customCashMin: string
  customCashMax: string
  allowCustomPoints: boolean
  customPointsMin: number
  customPointsMax: number
  thanksMessage: string
  publicRecords: boolean
}

/**
 * R010「打赏设置」页的取数与表单域：打赏设置（开关 / 档位 / 自填上下限 / 感谢语 / 公开记录）、
 * 保存前的本地校验（与后端 `normalize_settings` 同口径）、收到打赏列表与累计读数。
 *
 * 视图只剩读数条、提示条与两个卡片挂点；档位增删这类纯表单动作在表单组件里就地做。
 */
export function useDevTipSettings() {
  const auth = useAuthStore()

  const loading = ref(false)
  const saving = ref(false)
  const settingsLoaded = ref(false)
  const settlementReady = ref(true)
  const platformFeeBps = ref(0)
  const noticeText = ref('')

  const form = reactive<DevTipSettingsForm>({
    enabled: false,
    cashEnabled: true,
    pointsEnabled: true,
    cashTiers: [] as string[],
    pointsTiers: [] as number[],
    allowCustomCash: true,
    customCashMin: '1.00',
    customCashMax: '20000.00',
    allowCustomPoints: true,
    customPointsMin: 10,
    customPointsMax: 100000,
    thanksMessage: '',
    publicRecords: false,
  })

  const received = ref<TipOrder[]>([])
  const receivedLoading = ref(false)

  const feePercentText = computed(() =>
    platformFeeBps.value > 0
      ? `${(platformFeeBps.value / 100).toFixed(2).replace(/\.?0+$/, '')}%`
      : '—',
  )

  const receivedCashTotal = computed(() =>
    received.value
      .filter((item) => item.status === 'paid' && item.amount_points <= 0)
      .reduce((sum, item) => sum + item.amount_fen, 0),
  )
  const receivedPointsTotal = computed(() =>
    received.value
      .filter((item) => item.status === 'paid' && item.amount_points > 0)
      .reduce((sum, item) => sum + item.amount_points, 0),
  )

  function fillForm(settings: TipSettings) {
    form.enabled = settings.enabled
    form.cashEnabled = settings.cash_enabled
    form.pointsEnabled = settings.points_enabled
    form.cashTiers = (settings.cash_tiers_fen ?? []).map((fen) => fenToYuanText(fen))
    form.pointsTiers = [...(settings.points_tiers ?? [])]
    form.allowCustomCash = settings.allow_custom_cash
    form.customCashMin = fenToYuanText(settings.custom_cash_min_fen)
    form.customCashMax = fenToYuanText(settings.custom_cash_max_fen)
    form.allowCustomPoints = settings.allow_custom_points
    form.customPointsMin = settings.custom_points_min
    form.customPointsMax = settings.custom_points_max
    form.thanksMessage = settings.thanks_message ?? ''
    form.publicRecords = settings.public_records
  }

  /** 设置响应里与表单无关的那几项（结算账户、平台服务费、提示语）统一回填。 */
  function applyResponse(resp: TipSettingsResponse) {
    fillForm(resp)
    settlementReady.value = resp.settlement_ready !== false
    platformFeeBps.value = resp.platform_fee_bps ?? 0
    noticeText.value = resp.notice ?? ''
  }

  async function loadSettings() {
    auth.hydrate()
    if (!auth.token.trim()) {
      return
    }
    loading.value = true
    try {
      const resp = await getTipSettings(auth.token)
      applyResponse(resp)
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
      received.value = await listReceivedTips(auth.token, { limit: RECEIVED_FETCH_LIMIT })
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
    if (form.enabled && !form.cashEnabled && !form.pointsEnabled) {
      return '至少需要开启一种打赏方式'
    }
    const cashTiers = validateTipCashTiers(form.cashTiers.map((item) => item.trim() || '0'))
    if (!cashTiers.ok) {
      return cashTiers.message
    }
    const pointsTiers = validateTipPointsTiers(form.pointsTiers.map((item) => String(item ?? '')))
    if (!pointsTiers.ok) {
      return pointsTiers.message
    }
    const cashRange = validateTipCustomCashRange(form.customCashMin, form.customCashMax)
    if (!cashRange.ok) {
      return cashRange.message
    }
    const pointsRange = validateTipCustomPointsRange(form.customPointsMin, form.customPointsMax)
    if (!pointsRange.ok) {
      return pointsRange.message
    }
    return null
  }

  function buildPayload(): TipSettings {
    const cashTiers = validateTipCashTiers(form.cashTiers.map((item) => item.trim() || '0'))
    const pointsTiers = validateTipPointsTiers(form.pointsTiers.map((item) => String(item ?? '')))
    const cashRange = validateTipCustomCashRange(form.customCashMin, form.customCashMax)
    const pointsRange = validateTipCustomPointsRange(form.customPointsMin, form.customPointsMax)
    // 上面已校验通过，这里用非空断言取回换算结果
    return {
      enabled: form.enabled,
      cash_enabled: form.cashEnabled,
      points_enabled: form.pointsEnabled,
      cash_tiers_fen: cashTiers.ok ? cashTiers.tiers : [],
      points_tiers: pointsTiers.ok ? pointsTiers.tiers : [],
      allow_custom_cash: form.allowCustomCash,
      custom_cash_min_fen: cashRange.ok ? cashRange.minFen : 100,
      custom_cash_max_fen: cashRange.ok ? cashRange.maxFen : 2000000,
      allow_custom_points: form.allowCustomPoints,
      custom_points_min: pointsRange.ok ? pointsRange.minPoints : 10,
      custom_points_max: pointsRange.ok ? pointsRange.maxPoints : 100000,
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
      const resp = await updateTipSettings(auth.token, buildPayload())
      applyResponse(resp)
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
    settlementReady,
    noticeText,
    form,
    received,
    receivedLoading,
    feePercentText,
    receivedCashTotal,
    receivedPointsTotal,
    save,
    refreshAll,
  }
}
