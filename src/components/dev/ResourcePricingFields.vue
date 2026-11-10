<script setup lang="ts">
import { computed, ref } from 'vue'
import { TFormItem, TInput, TTooltip } from 'ui_73info'
import {
  RESOURCE_FEE_UNAVAILABLE_TEXT,
  resourceExpectedNetLabel,
  resourceFeeHintText,
} from '@/shared/requirementFee'

/**
 * 售价（元）/ 积分售价 / 推广分成比例三格。
 *
 * 三者互相牵制（填了现金价要清积分价、卖过现金价就不能改积分价），
 * 规则在 `useResourcePricingFields` 里，这里只负责把控件与读数摆出来，
 * 并把「现金价输入框的底层元素」回传给父级——实时归一要改写 input 的值与光标。
 */
const props = defineProps<{
  isApiKind: boolean
  cashPriceDisabled: boolean
  pointsPriceDisabled: boolean
  pointsLockedBySavedCash: boolean
  /** 绑定需求单且需求方尚未「转为我的资源」：售价与公开申请都锁定。 */
  saleLockedByRequirement: boolean
  promoShareError: string
  /** 拖动条右侧读数：`0%` 显示成「关闭」。 */
  promoShareDisplay: string
  /** 比例是否为 0（关闭态用弱化样式）。 */
  promoShareOff: boolean
  /** 平台抽成比例（基点）；读不到为 null。 */
  platformFeeBps: number | null
  /** 费率读取失败：售价旁明确提示「费率暂不可用」。 */
  platformFeeError: boolean
}>()

const emit = defineEmits<{
  cashPriceInput: [el: HTMLInputElement | null]
  pointsPriceInput: []
}>()

const priceYuan = defineModel<string>('priceYuan', { required: true })
const pricePoints = defineModel<string>('pricePoints', { required: true })
const promoSharePercent = defineModel<number>('promoSharePercent', { required: true })

/** 现金价输入框实例：实时归一前导 0 时要拿到它的底层 input 来改写值并复位光标。 */
const cashPriceInputRef = ref<InstanceType<typeof TInput> | null>(null)

function onCashPriceInput() {
  emit('cashPriceInput', cashPriceInputRef.value?.inputRef ?? null)
}

const feeHintText = computed(() => {
  if (props.platformFeeError) {
    return RESOURCE_FEE_UNAVAILABLE_TEXT
  }
  if (props.platformFeeBps == null) {
    return ''
  }
  const net = resourceExpectedNetLabel(priceYuan.value, pricePoints.value, props.platformFeeBps)
  return resourceFeeHintText(props.platformFeeBps, net)
})
</script>

<template>
  <TFormItem label="售价（元）" class="dev-basic-info-grid__price dev-basic-info-grid__price-cash">
    <TInput
      ref="cashPriceInputRef"
      v-model="priceYuan"
      :disabled="cashPriceDisabled"
      placeholder="0 = 免费"
      inputmode="decimal"
      :title="isApiKind ? undefined : '与积分售价互斥；大于 0 为现金一口价'"
      @input="onCashPriceInput"
    />
    <p
      v-if="saleLockedByRequirement"
      class="dev-field-hint"
      data-testid="resource-sale-locked-hint"
    >
      需求方尚未转为我的资源，暂不可定价
    </p>
    <TTooltip
      v-if="feeHintText && !platformFeeError"
      class="dev-platform-fee-hint"
      data-testid="resource-platform-fee-hint"
      tabindex="0"
      :content="feeHintText"
      placement="top"
      :max-width="360"
    >
      <span class="dev-platform-fee-hint__trigger">费率提示</span>
    </TTooltip>
    <p
      v-else-if="platformFeeError"
      class="dev-field-hint dev-field-hint--error"
      data-testid="resource-platform-fee-hint"
    >
      {{ feeHintText }}
    </p>
  </TFormItem>

  <TFormItem v-if="!isApiKind" label="积分售价" class="dev-basic-info-grid__points">
    <TInput
      v-model="pricePoints"
      :disabled="pointsPriceDisabled"
      placeholder="0 = 不用积分购"
      inputmode="numeric"
      title="与现金售价互斥；大于 0 时买家只能用积分购买"
      @input="emit('pointsPriceInput')"
    />
    <p v-if="pointsLockedBySavedCash && !saleLockedByRequirement" class="dev-field-hint">
      设过现金售价，不可改为积分售价。
    </p>
  </TFormItem>

  <!-- R029 推广分成比例：0～50（%），0 = 关闭；随「保存」一次提交（promo_share_bps） -->
  <TFormItem
    label="推广分成比例"
    class="dev-basic-info-grid__promo"
    :class="{ 'dev-basic-info-grid__promo--inline': isApiKind }"
  >
    <div class="dev-promo-share">
      <input
        v-model.number="promoSharePercent"
        class="dev-promo-share__range"
        type="range"
        min="0"
        max="50"
        step="1"
        :title="promoShareDisplay"
        aria-label="推广分成比例（百分比，0 表示关闭）"
      />
      <span class="dev-promo-share__value" :class="{ 'is-off': promoShareOff }">{{
        promoShareDisplay
      }}</span>
    </div>
    <p v-if="promoShareError" class="dev-field-hint dev-field-hint--error">
      {{ promoShareError }}
    </p>
  </TFormItem>
</template>
