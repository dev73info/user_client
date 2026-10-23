<script setup lang="ts">
import { TIP_MAX_TIERS, TIP_THANKS_MAX_LENGTH } from '@/shared/devTip'

import { Close, Plus, TButton, TForm, TFormItem, TIcon, TInput, TSwitch } from 'ui_73info'

/**
 * R010 打赏设置表单：开关、现金 / 积分档位、自填上下限、感谢语与公开记录。
 * 字段逐个双向绑回页面那份 `form`（页头读数条要读「是否开启」，保存与校验在
 * `useDevTipSettings`）；这里只做纯表单动作并 emit `save`。
 */
const enabled = defineModel<boolean>('enabled', { required: true })
const cashEnabled = defineModel<boolean>('cashEnabled', { required: true })
const pointsEnabled = defineModel<boolean>('pointsEnabled', { required: true })
const cashTiers = defineModel<string[]>('cashTiers', { required: true })
const pointsTiers = defineModel<number[]>('pointsTiers', { required: true })
const allowCustomCash = defineModel<boolean>('allowCustomCash', { required: true })
const customCashMin = defineModel<string>('customCashMin', { required: true })
const customCashMax = defineModel<string>('customCashMax', { required: true })
const allowCustomPoints = defineModel<boolean>('allowCustomPoints', { required: true })
const customPointsMin = defineModel<number>('customPointsMin', { required: true })
const customPointsMax = defineModel<number>('customPointsMax', { required: true })
const thanksMessage = defineModel<string>('thanksMessage', { required: true })
const publicRecords = defineModel<boolean>('publicRecords', { required: true })

defineProps<{
  saving: boolean
  noticeText: string
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

function addPointsTier() {
  if (pointsTiers.value.length >= TIP_MAX_TIERS) {
    return
  }
  pointsTiers.value.push(0)
}

function removePointsTier(index: number) {
  pointsTiers.value.splice(index, 1)
}

function onPointsTierInput(index: number, value: string) {
  const trimmed = value.trim()
  pointsTiers.value[index] = trimmed === '' ? 0 : Number(trimmed)
}
</script>

<template>
  <TForm label-position="top" class="tip-settings__form">
    <h4 class="tip-settings__section-title">开关</h4>

    <TFormItem label="开启打赏">
      <TSwitch v-model="enabled" aria-label="开启打赏" />
    </TFormItem>

    <TFormItem label="打赏通道">
      <div class="tip-settings__switches">
        <label class="tip-settings__switch-line">
          <TSwitch v-model="cashEnabled" aria-label="开启现金打赏" />
          <span>现金打赏</span>
        </label>
        <label class="tip-settings__switch-line">
          <TSwitch v-model="pointsEnabled" aria-label="开启积分打赏" />
          <span>积分打赏</span>
        </label>
      </div>
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

    <TFormItem label="积分档位">
      <div class="tip-settings__tier-list">
        <div
          v-for="(_, index) in pointsTiers"
          :key="`points-tier-${index}`"
          class="tip-settings__tier-cell"
        >
          <TInput
            :model-value="String(pointsTiers[index] ?? '')"
            placeholder="如 50"
            aria-label="积分档位数值"
            @update:model-value="onPointsTierInput(index, $event)"
          />
          <TButton
            icon-only
            variant="text"
            tone="danger"
            aria-label="删除该积分档位"
            @click="removePointsTier(index)"
          >
            <TIcon>
              <Close />
            </TIcon>
          </TButton>
        </div>
        <TButton
          variant="outline"
          class="tip-settings__tier-add"
          :disabled="pointsTiers.length >= TIP_MAX_TIERS"
          @click="addPointsTier"
        >
          <TIcon>
            <Plus />
          </TIcon>
          添加积分档位
        </TButton>
      </div>
      <p class="tip-settings__limit">最多 {{ TIP_MAX_TIERS }} 档，每档为正整数。</p>
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

    <TFormItem label="积分自填">
      <div class="tip-settings__range">
        <TSwitch v-model="allowCustomPoints" aria-label="允许积分自填" />
        <template v-if="allowCustomPoints">
          <TInput
            :model-value="String(customPointsMin ?? '')"
            class="tip-settings__range-input"
            placeholder="下限"
            aria-label="积分自填下限"
            @update:model-value="customPointsMin = Number($event.trim() || 0)"
          />
          <span class="tip-settings__range-sep">~</span>
          <TInput
            :model-value="String(customPointsMax ?? '')"
            class="tip-settings__range-input"
            placeholder="上限"
            aria-label="积分自填上限"
            @update:model-value="customPointsMax = Number($event.trim() || 0)"
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

    <p v-if="noticeText" class="tip-settings__notice">{{ noticeText }}</p>

    <div class="tip-settings__actions">
      <TButton variant="solid" tone="accent" :loading="saving" @click="emit('save')">
        保存设置
      </TButton>
    </div>
  </TForm>
</template>

<style scoped src="./tip-settings-form.css"></style>
