<script setup lang="ts">
/**
 * 对私自动开户的表单字段（`SettlementOpenRequest`）。
 *
 * 与「只收后四位」的人工通道不同，这条路要完整卡号、银行预留手机号、证件号与开户省市：
 * 后端拿到后直接向渠道建会员 + 绑卡，完整卡号只在请求体里出现一次，不落库。
 * 字段值全部由父级持有（`settleForm`），本组件只做受控输入并回传。
 */
import { computed } from 'vue'

import { settlementBanks, settlementProvinces } from '@/utils/settlementAccount'
import type { SelectModelValue } from 'ui_73info'
import { TFormItem, TInput, TOption, TSelect } from 'ui_73info'

const props = defineProps<{
  cardId: string
  telNo: string
  certId: string
  bankCode: string
  provCode: string
  areaCode: string
  /** 当前省份下的城市（父级按省份算好）。 */
  cities: Array<{ value: string; title: string }>
  cardPlaceholder: string
}>()

const emit = defineEmits<{
  'update:card-id': [cardId: string]
  'update:tel-no': [telNo: string]
  'update:cert-id': [certId: string]
  'update:bank-code': [bankCode: string]
  'update:prov-code': [provCode: string]
  'update:area-code': [areaCode: string]
}>()

function selectText(value: SelectModelValue): string {
  return value == null ? '' : String(value)
}

const cardId = computed<string>({
  get: () => props.cardId,
  set: (next: string) => emit('update:card-id', next),
})

const telNo = computed<string>({
  get: () => props.telNo,
  set: (next: string) => emit('update:tel-no', next),
})

const certId = computed<string>({
  get: () => props.certId,
  set: (next: string) => emit('update:cert-id', next),
})

const bankCode = computed<string>({
  get: () => props.bankCode,
  set: (next: SelectModelValue) => emit('update:bank-code', selectText(next)),
})

const provCode = computed<string>({
  get: () => props.provCode,
  set: (next: SelectModelValue) => emit('update:prov-code', selectText(next)),
})

const areaCode = computed<string>({
  get: () => props.areaCode,
  set: (next: SelectModelValue) => emit('update:area-code', selectText(next)),
})
</script>

<template>
  <TFormItem label="银行卡号" required>
    <TInput v-model="cardId" inputmode="numeric" :placeholder="props.cardPlaceholder" />
  </TFormItem>
  <TFormItem label="银行预留手机号" required>
    <TInput v-model="telNo" inputmode="numeric" placeholder="银行预留手机号" />
  </TFormItem>
  <TFormItem label="证件号" required>
    <TInput v-model="certId" placeholder="与实名一致的证件号" />
  </TFormItem>
  <TFormItem label="开户银行" required>
    <TSelect
      v-model="bankCode"
      :options="settlementBanks"
      filterable
      clearable
      placeholder="搜索或选择银行名称"
      no-match-text="未找到该银行"
      style="width: 100%"
    />
  </TFormItem>
  <div class="settle-form__pair">
    <TFormItem label="开户省份" required>
      <TSelect
        v-model="provCode"
        filterable
        clearable
        placeholder="选择开户银行所在省份"
        style="width: 100%"
      >
        <TOption
          v-for="province in settlementProvinces"
          :key="province.value"
          :label="province.title"
          :value="province.value"
        />
      </TSelect>
    </TFormItem>
    <TFormItem label="开户城市" required>
      <TSelect
        v-model="areaCode"
        filterable
        clearable
        :disabled="!props.provCode"
        :placeholder="props.provCode ? '选择开户银行所在城市' : '请先选择开户省份'"
        style="width: 100%"
      >
        <TOption
          v-for="city in props.cities"
          :key="city.value"
          :label="city.title"
          :value="city.value"
        />
      </TSelect>
    </TFormItem>
  </div>
</template>

<style scoped>
/* 省市并排：窄屏（手机档）改成上下两行，避免两个下拉挤到看不清 */
.settle-form__pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

@media (max-width: 640px) {
  .settle-form__pair {
    grid-template-columns: 1fr;
  }
}
</style>
