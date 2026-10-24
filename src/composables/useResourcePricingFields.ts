import { computed, type Ref } from 'vue'
import type { McResourcePayload } from '@/api/mcResources'
import {
  canSwitchToPointsPrice,
  normalizeYuanPriceText,
  parsePointsPriceInput,
  parsePromoSharePercentInput,
  parseYuanPriceInput,
} from '@/shared/resourceSale'
import type { ResourceHomepageFormState } from '@/shared/resourceHomepageForm'

/**
 * 售价与推广分成这两个「改一个就得清另一个」的字段。
 *
 * 三者（现金价 / 积分价 / 推广分成）互相牵制：填了现金价要清积分价、
 * 卖过一次现金价就不能再改积分价、已绑定定制交付的不能定价。判定集中在这里，
 * 保存时的校验读同一份 computed，避免「界面能填、保存被拒」。
 */
export function useResourcePricingFields(
  form: ResourceHomepageFormState,
  options: {
    resource: Ref<McResourcePayload | null>
    boundToRequirement: Ref<boolean>
  },
) {
  const { resource, boundToRequirement } = options

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
  const isPaidPricing = computed(
    () =>
      (parsedPriceFen.value.ok && parsedPriceFen.value.fen > 0) ||
      (parsedPricePoints.value.ok && parsedPricePoints.value.points > 0),
  )
  // 积分价可直接改现金价：输入现金价时清空积分价
  const cashPriceDisabled = computed(() => boundToRequirement.value)
  const pointsLockedBySavedCash = computed(
    () =>
      !canSwitchToPointsPrice(resource.value?.buyout_price_fen, resource.value?.cash_price_locked),
  )
  const pointsPriceDisabled = computed(
    () =>
      boundToRequirement.value ||
      pointsLockedBySavedCash.value ||
      (parsedPriceFen.value.ok && parsedPriceFen.value.fen > 0),
  )

  /**
   * 售价（元）实时归一：只留数字与第一个小数点、小数最多两位，并去掉整数前导 0。
   *
   * 为什么要自己改 DOM：`TInput` 的 `:value` 只在模型真的变了才回写输入框，而 `00` → `0`
   * 这类归一不会改变模型，输入框就会停在被归一前的文本上。所以这里拿底层 input 直接改写，
   * 并把光标按被丢弃的字符数左移，避免打字时光标跳到开头。
   * 底层 input 来自 `TInput` 的 `defineExpose`（实例代理会把那个 ref 解包成元素）；
   * 输入框在子组件里，所以元素由子组件在 `input` 事件里回传。
   */
  function normalizeCashPriceInput(el: HTMLInputElement | null) {
    const raw = form.priceYuan
    const { text, caret } = normalizeYuanPriceText(raw, el?.selectionStart ?? null)
    if (text === raw) {
      return
    }

    form.priceYuan = text
    if (!el || caret === null) {
      return
    }

    el.value = text
    el.setSelectionRange(caret, caret)
  }

  function onCashPriceInput(el: HTMLInputElement | null) {
    normalizeCashPriceInput(el)
    if (parsedPriceFen.value.ok && parsedPriceFen.value.fen > 0) {
      form.pricePoints = '0'
    }
  }

  function onPointsPriceInput() {
    if (parsedPricePoints.value.ok && parsedPricePoints.value.points > 0) {
      form.priceYuan = '0'
    }
  }

  return {
    parsedPriceFen,
    parsedPricePoints,
    parsedPromoShare,
    promoShareError,
    promoSharePercentValue,
    promoShareDisplay,
    isPaidPricing,
    cashPriceDisabled,
    pointsLockedBySavedCash,
    pointsPriceDisabled,
    normalizeCashPriceInput,
    onCashPriceInput,
    onPointsPriceInput,
  }
}
