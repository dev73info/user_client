<script setup lang="ts">
import { ref } from 'vue'
import { TFormItem, TInput } from 'ui_73info'

/**
 * 售价（元）/ 积分售价 / 推广分成比例三格。
 *
 * 三者互相牵制（填了现金价要清积分价、卖过现金价就不能改积分价），
 * 规则在 `useResourcePricingFields` 里，这里只负责把控件与读数摆出来，
 * 并把「现金价输入框的底层元素」回传给父级——实时归一要改写 input 的值与光标。
 */
defineProps<{
  isApiKind: boolean
  cashPriceDisabled: boolean
  pointsPriceDisabled: boolean
  pointsLockedBySavedCash: boolean
  boundToRequirement: boolean
  promoShareError: string
  /** 拖动条右侧读数：`0%` 显示成「关闭」。 */
  promoShareDisplay: string
  /** 比例是否为 0（关闭态用弱化样式）。 */
  promoShareOff: boolean
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
</script>

<template>
  <TFormItem label="售价（元）" class="dev-basic-info-grid__price">
    <TInput
      ref="cashPriceInputRef"
      v-model="priceYuan"
      :disabled="cashPriceDisabled"
      placeholder="0 = 免费"
      inputmode="decimal"
      :title="isApiKind ? undefined : '与积分售价互斥；大于 0 为现金一口价'"
      @input="onCashPriceInput"
    />
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
    <p v-if="pointsLockedBySavedCash && !boundToRequirement" class="dev-field-hint">
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
