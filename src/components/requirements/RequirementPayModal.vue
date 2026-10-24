<script setup lang="ts">
import { computed } from 'vue'

import type { AdapayBusinessPayChannel } from '@/api/adapay'
import type { RequirementItem } from '@/api/requirements'
import type { RequirementPayOrder } from '@/composables/useRequirementPayFlow'
import { formatBudget } from '@/shared/requirementRowRules'

/**
 * 需求支付弹窗：定金 / 尾款的通道选择与「支付 / 查询支付结果」两个动作。
 *
 * 纯展示：金额、阶段标签、订单状态都由 `useRequirementPayFlow` 算好传进来（金额口径在
 * `shared/requirementPayment`，比例由视图注入），下单与查单的请求也在那边；
 * 这里只 emit `submit`，跳转由视图执行——组件不碰 router，也不碰 window。
 *
 * 外壳沿用全局的 `.modal-wrap` / `.pay-modal`（见 `styles/modal.css`），故组件本身不带样式。
 */
const props = defineProps<{
  visible: boolean
  requirement: RequirementItem | null
  /** 当前选中的通道（支付宝 / 微信）。 */
  channel: AdapayBusinessPayChannel
  /** 下单或查单进行中：按钮置灰并显示「处理中...」。 */
  loading: boolean
  /** 已创建的订单：有值时按钮变成「查询支付结果」。 */
  order: RequirementPayOrder | null
  /** 「定金」还是「尾款」。 */
  stageLabel: string
  /** 本次应付金额。 */
  amount: number
  isFinalPayment: boolean
  /** 定金占比（仅定金阶段展示）。 */
  depositRatioPercent: number
}>()

const emit = defineEmits<{
  close: []
  /** 与模板的 `@update:channel` / `v-model:channel` 同键——拆出组件时曾误写成 `updateChannel`，
   *  监听不到导致「点微信仍按支付宝下单」，见 `requirementPayModal.spec.ts` 的回归用例。 */
  'update:channel': [channel: AdapayBusinessPayChannel]
  submit: []
}>()

/**
 * 「本次应付」整行文本在脚本里拼。
 *
 * 原来模板用 `<span v-if>` 挂「· 定金占比 x%」：拆成多行后条件渲染的空格会被模板编译器
 * （`whitespace: 'condense'`）吃掉，金额与说明会粘在一起；拼成一个字符串则逐字不变。
 */
const amountText = computed(() =>
  props.isFinalPayment
    ? formatBudget(props.amount)
    : `${formatBudget(props.amount)} · 定金占比 ${props.depositRatioPercent.toFixed(2)}%`,
)
</script>

<template>
  <div v-if="props.visible && props.requirement" class="modal-wrap" @click.self="emit('close')">
    <section class="pay-modal" aria-label="需求支付">
      <h3>支付{{ props.stageLabel }}</h3>
      <p class="pay-line"><strong>需求标题：</strong>{{ props.requirement.title }}</p>
      <p class="pay-line"><strong>需求编号：</strong>{{ props.requirement.requirement_id }}</p>
      <p class="pay-line"><strong>本次应付：</strong>{{ amountText }}</p>
      <p class="tip">
        {{ props.order ? '订单已创建，点下列按钮查询支付结果' : '选择支付方式，付款后回来确认' }}
      </p>

      <div class="payment-options" role="radiogroup" aria-label="支付方式选择">
        <button
          type="button"
          class="payment-option"
          :class="{
            active: props.channel === 'alipay',
            'payment-option--alipay': props.channel === 'alipay',
          }"
          @click="emit('update:channel', 'alipay')"
        >
          <img class="payment-option-icon" src="/icons/alipay.png" alt="支付宝" />
          支付宝
        </button>
        <button
          type="button"
          class="payment-option"
          :class="{
            active: props.channel === 'wechat',
            'payment-option--wechat': props.channel === 'wechat',
          }"
          @click="emit('update:channel', 'wechat')"
        >
          <img class="payment-option-icon" src="/icons/wechat-pay.png" alt="微信" />
          微信
        </button>
      </div>

      <div class="actions">
        <button class="ghost" type="button" @click="emit('close')">取消</button>
        <button
          class="ghost primary"
          type="button"
          :disabled="props.loading"
          @click="emit('submit')"
        >
          {{
            props.loading ? '处理中...' : props.order ? '查询支付结果' : `支付${props.stageLabel}`
          }}
        </button>
      </div>
    </section>
  </div>
</template>
