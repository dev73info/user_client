<script setup lang="ts">
/**
 * R010 开发者工作台「打赏设置」页。
 *
 * 两块内容：
 * 1. 打赏设置：总开关、现金 / 积分通道开关、现金档位（1–6 档，元）、积分档位（1–6 档）、
 *    是否允许自填与各自的上下限、打赏页感谢语（≤100 字）、是否公开打赏记录；
 *    保存前做与后端同口径的本地校验（见 `@/shared/devTip`）。
 * 2. 收到打赏：本人收到的打赏只读列表（含未公开的），现金 / 积分、金额、状态、留言、匿名、时间。
 *
 * 现金打赏要求开发者已绑定可用的 Adapay 结算账户；`settlement_ready=false` 时页面顶部提示
 * 「先绑结算账户」并给出入口。
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import {
  getTipSettings,
  listReceivedTips,
  updateTipSettings,
  type TipOrder,
  type TipSettings,
} from '@/api/tips'
import { LIST_PAGE_SIZES, useClientPagination } from '@/composables/useClientPagination'
import { useAuthStore } from '@/stores/auth'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import {
  fenToYuanText,
} from '@/shared/resourceSale'
import {
  formatTipCashTier,
  TIP_MAX_TIERS,
  TIP_THANKS_MAX_LENGTH,
  tipOrderAmountLabel,
  tipStatusLabel,
  validateTipCashTiers,
  validateTipCustomCashRange,
  validateTipCustomPointsRange,
  validateTipPointsTiers,
} from '@/shared/devTip'
import {
  TAlert,
  TButton,
  TCard,
  TForm,
  TFormItem,
  TIcon,
  TInput,
  TMessage,
  TOption,
  TPagination,
  Plus,
  Refresh,
  Close,
  TSelect,
  TSwitch,
  TTable,
  TTableColumn,
  TTag,
} from 'ui_73info'

const router = useRouter()
const auth = useAuthStore()

/** 一次取回本页全部收到打赏（后端单页上限 100 条），前端分页。 */
const RECEIVED_FETCH_LIMIT = 100

const loading = ref(false)
const saving = ref(false)
const settingsLoaded = ref(false)
const settlementReady = ref(true)
const platformFeeBps = ref(0)
const noticeText = ref('')

const form = reactive({
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

const { page, pageSize, total: receivedTotal, paged, resetPage } = useClientPagination(received)

const feePercentText = computed(() =>
  platformFeeBps.value > 0 ? `${(platformFeeBps.value / 100).toFixed(2).replace(/\.?0+$/, '')}%` : '—',
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

async function loadSettings() {
  auth.hydrate()
  if (!auth.token.trim()) {
    return
  }
  loading.value = true
  try {
    const resp = await getTipSettings(auth.token)
    fillForm(resp)
    settlementReady.value = resp.settlement_ready !== false
    platformFeeBps.value = resp.platform_fee_bps ?? 0
    noticeText.value = resp.notice ?? ''
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

function addCashTier() {
  if (form.cashTiers.length >= TIP_MAX_TIERS) {
    return
  }
  form.cashTiers.push('')
}

function removeCashTier(index: number) {
  form.cashTiers.splice(index, 1)
}

function addPointsTier() {
  if (form.pointsTiers.length >= TIP_MAX_TIERS) {
    return
  }
  form.pointsTiers.push(0)
}

function removePointsTier(index: number) {
  form.pointsTiers.splice(index, 1)
}

function onPointsTierInput(index: number, value: string) {
  const trimmed = value.trim()
  form.pointsTiers[index] = trimmed === '' ? 0 : Number(trimmed)
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
    fillForm(resp)
    settlementReady.value = resp.settlement_ready !== false
    platformFeeBps.value = resp.platform_fee_bps ?? 0
    noticeText.value = resp.notice ?? ''
    TMessage.success('打赏设置已保存')
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '保存打赏设置失败')
  } finally {
    saving.value = false
  }
}

function goBindSettlementAccount() {
  void router.push({ name: 'dev-wallet' })
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
</script>

<template>
  <div class="dev-page dev-page--tip-settings">
    <WorkbenchBarSlot>
      <div class="dev-meta-strip">
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">打赏状态</span>
          <span class="dev-meta-strip__value">{{ form.enabled ? '已开启' : '未开启' }}</span>
        </div>
        <div class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">累计现金</span>
          <span class="dev-meta-strip__value">{{ receivedLoading ? '—' : `¥${fenToYuanText(receivedCashTotal)}` }}</span>
        </div>
        <div class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">累计积分</span>
          <span class="dev-meta-strip__value">{{ receivedLoading ? '—' : receivedPointsTotal }}</span>
        </div>
        <div class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">平台服务费</span>
          <span class="dev-meta-strip__value">{{ feePercentText }}</span>
        </div>
        <div class="dev-meta-strip__item dev-meta-strip__action">
          <TButton icon-only :loading="loading || receivedLoading" aria-label="刷新打赏数据" @click="refreshAll">
            <TIcon>
              <Refresh />
            </TIcon>
          </TButton>
        </div>
      </div>
    </WorkbenchBarSlot>

    <!-- 未绑结算账户：现金打赏不可用，给出明确入口 -->
    <div v-if="settingsLoaded && !settlementReady" class="tip-settings__alert">
      <TAlert
        tone="warning"
        show-icon
        title="尚未绑定可用的结算账户"
        description="现金打赏需要先绑定 Adapay 结算账户才能向你结算；未绑定时他人无法用现金打赏。积分打赏不受影响。"
      />
      <div class="tip-settings__alert-actions">
        <TButton variant="outline" tone="accent" @click="goBindSettlementAccount">
          去绑定结算账户
        </TButton>
      </div>
    </div>

    <TCard class="dev-surface-card">
      <div class="dev-card-head">
        <div class="dev-card-head__title-block">
          <h3 class="dev-section-title">打赏设置</h3>
          <p class="tip-settings__hint">由你设定档位，他人只能从这些档位中选择或按你允许的区间自填。</p>
        </div>
      </div>

      <TForm label-position="top" class="tip-settings__form">
        <TFormItem label="开启打赏">
          <TSwitch v-model="form.enabled" aria-label="开启打赏" />
          <span class="tip-settings__hint">关闭后他人主页不再出现打赏入口，新打赏也会被拒绝。</span>
        </TFormItem>

        <TFormItem label="打赏通道">
          <div class="tip-settings__switches">
            <label class="tip-settings__switch-line">
              <TSwitch v-model="form.cashEnabled" aria-label="开启现金打赏" />
              <span>现金打赏</span>
            </label>
            <label class="tip-settings__switch-line">
              <TSwitch v-model="form.pointsEnabled" aria-label="开启积分打赏" />
              <span>积分打赏</span>
            </label>
          </div>
          <span class="tip-settings__hint">开启打赏时至少保留一种；现金打赏需要已绑定结算账户。</span>
        </TFormItem>

        <TFormItem label="现金档位（元）">
          <div v-if="form.cashTiers.length" class="tip-settings__tier-list">
            <div v-for="(_, index) in form.cashTiers" :key="`cash-tier-${index}`" class="tip-settings__tier-row">
              <TInput v-model="form.cashTiers[index]" placeholder="如 5.00" class="tip-settings__tier-input" />
              <TButton icon-only variant="text" tone="danger" aria-label="删除该现金档位" @click="removeCashTier(index)">
                <TIcon>
                  <Close />
                </TIcon>
              </TButton>
            </div>
          </div>
          <TButton
            variant="outline"
            :disabled="form.cashTiers.length >= TIP_MAX_TIERS"
            @click="addCashTier"
          >
            <TIcon>
              <Plus />
            </TIcon>
            添加现金档位
          </TButton>
          <span class="tip-settings__hint">最多 {{ TIP_MAX_TIERS }} 档，每档不超过 ¥999999.00。</span>
        </TFormItem>

        <TFormItem label="积分档位">
          <div v-if="form.pointsTiers.length" class="tip-settings__tier-list">
            <div v-for="(_, index) in form.pointsTiers" :key="`points-tier-${index}`" class="tip-settings__tier-row">
              <TInput
                :model-value="String(form.pointsTiers[index] ?? '')"
                placeholder="如 50"
                class="tip-settings__tier-input"
                @update:model-value="onPointsTierInput(index, $event)"
              />
              <TButton icon-only variant="text" tone="danger" aria-label="删除该积分档位" @click="removePointsTier(index)">
                <TIcon>
                  <Close />
                </TIcon>
              </TButton>
            </div>
          </div>
          <TButton
            variant="outline"
            :disabled="form.pointsTiers.length >= TIP_MAX_TIERS"
            @click="addPointsTier"
          >
            <TIcon>
              <Plus />
            </TIcon>
            添加积分档位
          </TButton>
          <span class="tip-settings__hint">最多 {{ TIP_MAX_TIERS }} 档，每档为正整数。</span>
        </TFormItem>

        <TFormItem label="允许现金自填">
          <TSwitch v-model="form.allowCustomCash" aria-label="允许现金自填" />
          <div v-if="form.allowCustomCash" class="tip-settings__range">
            <TInput v-model="form.customCashMin" class="tip-settings__range-input" placeholder="下限（元）" />
            <span class="tip-settings__range-sep">~</span>
            <TInput v-model="form.customCashMax" class="tip-settings__range-input" placeholder="上限（元）" />
          </div>
          <span class="tip-settings__hint">自填金额须落在该区间内（含端点）。</span>
        </TFormItem>

        <TFormItem label="允许积分自填">
          <TSwitch v-model="form.allowCustomPoints" aria-label="允许积分自填" />
          <div v-if="form.allowCustomPoints" class="tip-settings__range">
            <TInput
              :model-value="String(form.customPointsMin ?? '')"
              class="tip-settings__range-input"
              placeholder="下限"
              @update:model-value="form.customPointsMin = Number($event.trim() || 0)"
            />
            <span class="tip-settings__range-sep">~</span>
            <TInput
              :model-value="String(form.customPointsMax ?? '')"
              class="tip-settings__range-input"
              placeholder="上限"
              @update:model-value="form.customPointsMax = Number($event.trim() || 0)"
            />
          </div>
          <span class="tip-settings__hint">自填积分须落在该区间内（含端点）。</span>
        </TFormItem>

        <TFormItem label="打赏页感谢语">
          <TInput
            v-model="form.thanksMessage"
            type="textarea"
            :rows="2"
            :maxlength="TIP_THANKS_MAX_LENGTH"
            placeholder="在打赏弹窗里展示给支持者，例如：感谢你支持我的作品"
          />
          <span class="tip-settings__hint">
            {{ Array.from(form.thanksMessage).length }} / {{ TIP_THANKS_MAX_LENGTH }} 字
          </span>
        </TFormItem>

        <TFormItem label="公开打赏记录">
          <TSwitch v-model="form.publicRecords" aria-label="公开打赏记录" />
          <span class="tip-settings__hint">
            开启后，你的主页会显示累计收到打赏与最近的留言（匿名打赏显示为「匿名」）；关闭后他人看不到任何金额与留言。
          </span>
        </TFormItem>

        <p v-if="noticeText" class="tip-settings__notice">{{ noticeText }}</p>

        <div class="tip-settings__actions">
          <TButton variant="solid" tone="accent" :loading="saving" @click="save">保存设置</TButton>
        </div>
      </TForm>
    </TCard>

    <TCard class="dev-surface-card">
      <div class="dev-card-head">
        <div class="dev-card-head__title-block">
          <h3 class="dev-section-title">收到打赏</h3>
          <p class="tip-settings__hint">含未公开的记录；这里始终能看到全部打赏。</p>
        </div>
      </div>

      <TTable :loading="receivedLoading" :data="paged" stripe class="dev-table tip-settings__table" aria-label="收到打赏列表">
        <template #empty>
          <p class="dev-empty-state">还没有收到打赏</p>
        </template>
        <TTableColumn label="时间" min-width="160">
          <template #default="scope">
            <span>{{ scope.row.created_at }}</span>
          </template>
        </TTableColumn>
        <TTableColumn label="类型" min-width="90">
          <template #default="scope">
            <span>{{ scope.row.amount_points > 0 ? '积分' : '现金' }}</span>
          </template>
        </TTableColumn>
        <TTableColumn label="金额" min-width="120">
          <template #default="scope">
            <span class="tip-settings__amount">{{ tipOrderAmountLabel(scope.row) }}</span>
          </template>
        </TTableColumn>
        <TTableColumn label="状态" min-width="100">
          <template #default="scope">
            <TTag variant="outline" :tone="scope.row.status === 'paid' ? 'accent' : 'warning'">
              {{ tipStatusLabel(scope.row.status) }}
            </TTag>
          </template>
        </TTableColumn>
        <TTableColumn label="打赏者" min-width="140">
          <template #default="scope">
            <span>{{ scope.row.anonymous ? '匿名' : scope.row.tipper }}</span>
          </template>
        </TTableColumn>
        <TTableColumn label="留言" min-width="200">
          <template #default="scope">
            <span>{{ scope.row.message || '—' }}</span>
          </template>
        </TTableColumn>
      </TTable>

      <div class="dev-pager">
        <div class="dev-pager__count">
          <TSelect v-model="pageSize" aria-label="每页条数" class="dev-pager__size">
            <TOption v-for="size in LIST_PAGE_SIZES" :key="size" :label="`${size} 条/页`" :value="size" />
          </TSelect>
        </div>
        <TPagination v-model:current-page="page" :page-size="pageSize" :total="receivedTotal" :pager-count="5" background aria-label="收到打赏分页" />
      </div>
    </TCard>
  </div>
</template>

<style scoped>
.tip-settings__hint {
  display: block;
  margin-top: 6px;
  color: var(--dev-ink-muted, #64748b);
  font-size: 12px;
  line-height: 1.6;
}

.tip-settings__alert {
  display: grid;
  gap: 10px;
}

.tip-settings__alert-actions {
  display: flex;
  justify-content: flex-end;
}

.tip-settings__switches {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}

.tip-settings__switch-line {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #334155;
  font-size: 13px;
}

.tip-settings__tier-list {
  display: grid;
  gap: 8px;
  margin-bottom: 10px;
}

.tip-settings__tier-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tip-settings__tier-input {
  max-width: 220px;
}

.tip-settings__range {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.tip-settings__range-input {
  max-width: 160px;
}

.tip-settings__range-sep {
  color: #94a3b8;
}

.tip-settings__notice {
  margin: 4px 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(191, 219, 254, 0.85);
  background: rgba(248, 250, 252, 0.9);
  color: #64748b;
  font-size: 12px;
  line-height: 1.7;
}

.tip-settings__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.tip-settings__amount {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
</style>
