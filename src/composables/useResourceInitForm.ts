import { computed, reactive, ref, watch, type Ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import type { McResourceKind } from '@/api/mcResources'
import { listMyTeams, type TeamResponse } from '@/api/team'
import type { ResourceCreationType, ResourcePaidMode } from '@/shared/resourceCreation'
import {
  normalizeYuanPriceText,
  parsePointsPriceInput,
  parsePromoSharePercentInput,
  parseYuanPriceInput,
} from '@/shared/resourceSale'
import { createResourceInitFormState, type ResourceInitFormState } from '@/shared/resourceInitForm'

/** 创建页的字段、三类资源选择、价格校验与提交载荷派生值。 */
export function useResourceInitForm(options: {
  selectedTagCount: Ref<number>
  /** 当前二级节点 / 平台（读数与简介、来源地址同一口径，来自 useResourceTagCatalog）。 */
  currentEntryKey: Ref<string>
  currentEntryLabel: Ref<string>
  currentPlatform: Ref<string>
  currentPlatformLabel: Ref<string>
}) {
  const {
    selectedTagCount,
    currentEntryKey,
    currentEntryLabel,
    currentPlatform,
    currentPlatformLabel,
  } = options
  const auth = useAuthStore()

  const form = reactive<ResourceInitFormState>(createResourceInitFormState())
  /** 图标文件：只在用户选了本地文件时才有值，提交后单独上传，其余字段先落资源。 */
  const selectedIconFile = ref<File | null>(null)
  const creationType = ref<ResourceCreationType>('free')
  const paidMode = ref<ResourcePaidMode>('buyout')
  const resourceKind = computed<McResourceKind>(() =>
    creationType.value === 'api' ? 'api' : 'normal',
  )

  const isApiKind = computed(() => resourceKind.value === 'api')
  const isVersionSale = computed(
    () => creationType.value === 'paid' && paidMode.value === 'version',
  )
  const effectiveOriginType = computed<'original' | 'repost'>(() =>
    isApiKind.value ? 'original' : form.originType,
  )

  /* ---------- 售价与推广分成 ---------- */

  const parsedPriceFen = computed(() => parseYuanPriceInput(form.priceYuan))
  const parsedPricePoints = computed(() => parsePointsPriceInput(form.pricePoints))
  /** R029：推广分成比例（万分比）；校验失败时 `ok` 为假，字段上展示同一句文案 */
  const parsedPromoShare = computed(() => parsePromoSharePercentInput(form.promoSharePercent))
  const promoShareError = computed(() =>
    parsedPromoShare.value.ok ? '' : parsedPromoShare.value.message,
  )
  /** R029：拖动条展示口径（与提交口径同源：0 = 关闭） */
  const promoSharePercentValue = computed(() =>
    parsedPromoShare.value.ok ? parsedPromoShare.value.bps / 100 : 0,
  )
  const promoShareDisplay = computed(() =>
    promoSharePercentValue.value > 0 ? `${promoSharePercentValue.value}%` : '关闭',
  )
  const hasCashPrice = computed(() => parsedPriceFen.value.ok && parsedPriceFen.value.fen > 0)
  const hasPointsPrice = computed(
    () => parsedPricePoints.value.ok && parsedPricePoints.value.points > 0,
  )
  const cashPriceDisabled = computed(() => hasPointsPrice.value)
  const pointsPriceDisabled = computed(() => hasCashPrice.value)
  const showCopyrightField = computed(
    () =>
      creationType.value === 'paid' ||
      hasCashPrice.value ||
      hasPointsPrice.value ||
      form.copyrightDeclared,
  )

  watch(creationType, (type) => {
    if (type === 'free') {
      form.priceYuan = '0'
      form.pricePoints = '0'
      form.copyrightDeclared = false
    } else if (type === 'api') {
      form.pricePoints = '0'
    } else if (paidMode.value === 'version') {
      form.priceYuan = '0'
      form.pricePoints = '0'
    }
  })

  watch(paidMode, () => {
    if (creationType.value === 'paid') {
      form.priceYuan = '0'
      form.pricePoints = '0'
      form.copyrightDeclared = false
    }
  })

  /**
   * 售价（元）实时归一：只留数字与第一个小数点、小数最多两位，并去掉整数前导 0。
   *
   * 为什么要自己改 DOM：`TInput` 的 `:value` 只在模型真的变了才回写输入框，而 `00` → `0`
   * 这类归一不会改变模型，输入框就会停在被归一前的文本上。所以这里拿底层 input 直接改写，
   * 并把光标按被丢弃的字符数左移，避免打字时光标跳到开头。
   * 底层 input 由基础信息区块（`ResourceInitBasicInfoSection`）在 `input` 事件里回传。
   */
  function onCashPriceInput(input: HTMLInputElement | null) {
    const raw = form.priceYuan
    const { text, caret } = normalizeYuanPriceText(raw, input?.selectionStart ?? null)
    if (text !== raw) {
      form.priceYuan = text
      if (input && caret !== null) {
        input.value = text
        input.setSelectionRange(caret, caret)
      }
    }

    if (hasCashPrice.value) {
      form.pricePoints = '0'
    }
  }

  function onPointsPriceInput() {
    if (hasPointsPrice.value) {
      form.priceYuan = '0'
    }
  }

  /* ---------- 归属团队 ---------- */

  const myTeams = ref<TeamResponse[]>([])
  const teamOptions = computed(() =>
    myTeams.value.map((team) => ({
      value: String(team.team_id),
      label: team.name,
    })),
  )
  const hasJoinedTeam = computed(() => myTeams.value.length > 0)

  async function loadMyTeams() {
    if (!auth.token) return
    try {
      myTeams.value = await listMyTeams(auth.token)
    } catch (error) {
      console.error('Failed to load teams:', error)
    }
  }

  /* ---------- 归类读数与提交载荷的派生键 ---------- */

  const resourceSummary = computed(() => {
    if (!form.title.trim()) {
      return ''
    }

    // 接口资源不选标签归类、不属于任何根节点 / 二级节点，简介里只交代「接口资源 · 原创」
    if (isApiKind.value) {
      return '接口资源，原创。'
    }

    return `${currentEntryLabel.value} · ${currentPlatformLabel.value}资源，已选择 ${selectedTagCount.value} 个标签。`
  })

  const normalizedResourceKey = computed(() => {
    const base = form.title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

    return base || 'resource'
  })
  const derivedFileName = computed(() => `${normalizedResourceKey.value}.package`)
  const derivedSourceUrl = computed(() => {
    // 接口资源没有根节点 / 二级节点，来源地址用资源类别占位
    if (isApiKind.value) {
      return `pending://resource/api/${normalizedResourceKey.value}`
    }

    return `pending://resource/${currentPlatform.value}/${currentEntryKey.value || 'catalog'}/${normalizedResourceKey.value}`
  })

  /* ---------- 表单联动 ---------- */

  watch(
    () => auth.username,
    (username) => {
      if (!form.author.trim() && username) {
        form.author = username
      }
    },
    { immediate: true },
  )

  watch(
    () => form.ownershipType,
    (value) => {
      if (value !== 'team') {
        form.teamId = ''
      }
    },
  )

  /** 创建成功后复位（接口渠道状态与标签勾选由调用方一并复位）。 */
  function resetForm() {
    Object.assign(form, createResourceInitFormState())
    // 作者回到登录名：`createResourceInitFormState()` 是空串，但页面复位后不该把作者也清掉
    form.author = auth.username || ''
    selectedIconFile.value = null
  }

  return {
    form,
    selectedIconFile,
    creationType,
    paidMode,
    resourceKind,
    currentPlatform,
    isApiKind,
    isVersionSale,
    effectiveOriginType,
    parsedPriceFen,
    parsedPricePoints,
    parsedPromoShare,
    promoShareError,
    promoSharePercentValue,
    promoShareDisplay,
    hasCashPrice,
    hasPointsPrice,
    cashPriceDisabled,
    pointsPriceDisabled,
    showCopyrightField,
    onCashPriceInput,
    onPointsPriceInput,
    myTeams,
    teamOptions,
    hasJoinedTeam,
    loadMyTeams,
    resourceSummary,
    normalizedResourceKey,
    derivedFileName,
    derivedSourceUrl,
    resetForm,
  }
}
