<script setup lang="ts">
import { TIP_MAX_TIERS, TIP_THANKS_MAX_LENGTH } from '@/shared/devTip'

import { Close, Plus, TButton, TForm, TFormItem, TIcon, TInput, TSwitch } from 'ui_73info'

/**
 * R010 打赏设置表单：开关、现金档位、现金自填区间、感谢语与公开记录。
 *
 * 字段逐个双向绑回页面那份 `form`（页头读数条要读「是否开启」，保存与校验在
 * `useDevTipSettings`）；这里只做纯表单动作并 emit `save`。
 *
 * 契约 `UpdateTipConfigRequest` 只有现金一档（`enabled` / `cash_tiers_fen` /
 * `allow_custom_cash` / `custom_cash_min_fen` / `custom_cash_max_fen` / `thanks_message` /
 * `public_records`）：没有分通道开关、没有积分档位与积分自填，所以表单里也没有这些格子。
 */
const enabled = defineModel<boolean>('enabled', { required: true })
const cashTiers = defineModel<string[]>('cashTiers', { required: true })
const allowCustomCash = defineModel<boolean>('allowCustomCash', { required: true })
const customCashMin = defineModel<string>('customCashMin', { required: true })
const customCashMax = defineModel<string>('customCashMax', { required: true })
const thanksMessage = defineModel<string>('thanksMessage', { required: true })
const publicRecords = defineModel<boolean>('publicRecords', { required: true })

defineProps<{
  saving: boolean
}>()

const emit = defineEmits<{
  save: []
}>()

function addCashTier() {
  if (cashTiers.value.length >= TIP_MAX_TIERS) {
    return
  }
  cashTiers.value.push('')
}

function removeCashTier(index: number) {
  cashTiers.value.splice(index, 1)
}
</script>

<template>
  <TForm label-position="top" class="tip-settings__form">
    <h4 class="tip-settings__section-title">开关</h4>

    <TFormItem label="开启打赏">
      <TSwitch v-model="enabled" aria-label="开启打赏" />
    </TFormItem>

    <h4 class="tip-settings__section-title">档位</h4>

    <TFormItem label="现金档位（元）">
      <div class="tip-settings__tier-list">
        <div
          v-for="(_, index) in cashTiers"
          :key="`cash-tier-${index}`"
          class="tip-settings__tier-cell"
        >
          <TInput v-model="cashTiers[index]" placeholder="如 5.00" aria-label="现金档位金额" />
          <TButton
            icon-only
            variant="text"
            tone="danger"
            aria-label="删除该现金档位"
            @click="removeCashTier(index)"
          >
            <TIcon>
              <Close />
            </TIcon>
          </TButton>
        </div>
        <TButton
          variant="outline"
          class="tip-settings__tier-add"
          :disabled="cashTiers.length >= TIP_MAX_TIERS"
          @click="addCashTier"
        >
          <TIcon>
            <Plus />
          </TIcon>
          添加现金档位
        </TButton>
      </div>
      <p class="tip-settings__limit">最多 {{ TIP_MAX_TIERS }} 档，每档不超过 ¥999999.00。</p>
    </TFormItem>

    <TFormItem label="现金自填">
      <div class="tip-settings__range">
        <TSwitch v-model="allowCustomCash" aria-label="允许现金自填" />
        <template v-if="allowCustomCash">
          <TInput
            v-model="customCashMin"
            class="tip-settings__range-input"
            placeholder="下限（元）"
            aria-label="现金自填下限"
          />
          <span class="tip-settings__range-sep">~</span>
          <TInput
            v-model="customCashMax"
            class="tip-settings__range-input"
            placeholder="上限（元）"
            aria-label="现金自填上限"
          />
        </template>
      </div>
    </TFormItem>

    <h4 class="tip-settings__section-title">展示</h4>

    <TFormItem label="打赏页感谢语">
      <TInput
        v-model="thanksMessage"
        type="textarea"
        :rows="2"
        :maxlength="TIP_THANKS_MAX_LENGTH"
        placeholder="在打赏弹窗里展示给支持者，例如：感谢你支持我的作品"
      />
      <p class="tip-settings__limit">
        {{ Array.from(thanksMessage).length }} / {{ TIP_THANKS_MAX_LENGTH }} 字
      </p>
    </TFormItem>

    <TFormItem label="公开打赏记录">
      <TSwitch v-model="publicRecords" aria-label="公开打赏记录" />
    </TFormItem>

    <div class="tip-settings__actions">
      <TButton variant="solid" tone="accent" :loading="saving" @click="emit('save')">
        保存设置
      </TButton>
    </div>
  </TForm>
</template>

<style scoped src="./tip-settings-form.css"></style>
