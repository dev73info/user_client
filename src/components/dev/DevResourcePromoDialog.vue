<script setup lang="ts">
import { TButton, TDialog, TForm, TFormItem, TOption, TSelect } from 'ui_73info'

import type { PromoCardOption } from '@/composables/useDevResourcePromo'

/**
 * 「使用道具」弹窗：只画选项与两处提示。
 *
 * 选项文案（卡名 · 天数，精选卡被点赞门槛挡住时补一句原因）、当前点赞读数、
 * 被门槛挡住的禁用态都在 `useDevResourcePromo` 里算好；这里不碰 `@/api`。
 */
defineProps<{
  /** 弹窗开关（`v-model:open`） */
  open: boolean
  /** 目标资源标题，用于弹窗标题；没选资源时为 null */
  resourceTitle: string | null
  /** 目标资源当前点赞数（提示行用） */
  likeCount: number
  /** 精选卡的点赞门槛（提示行用） */
  threshold: number
  /** 背包里未使用的道具卡（附禁用判定与文案） */
  options: PromoCardOption[]
  /** 当前选中的道具卡 id */
  selectedId: number | null
  /** 正在提交：页脚按钮转圈 */
  applying: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:selectedId': [value: number | null]
  /** 确认使用：交给 `useDevResourcePromo.confirmApplyPromoCard` */
  confirm: []
}>()
</script>

<template>
  <TDialog
    :open="open"
    width="520px"
    class="dev-dialog"
    :title="resourceTitle !== null ? `使用道具 · ${resourceTitle}` : '使用道具'"
    @update:open="emit('update:open', $event)"
  >
    <p class="dev-promo-tip">当前点赞 {{ likeCount }}；精选卡需 ≥ {{ threshold }}。</p>
    <TForm v-if="options.length" label-position="top">
      <TFormItem label="选择道具卡" required>
        <TSelect
          :model-value="selectedId"
          placeholder="请选择未使用的道具卡"
          style="width: 100%"
          @update:model-value="emit('update:selectedId', $event as number | null)"
        >
          <TOption
            v-for="option in options"
            :key="option.id"
            :value="option.id"
            :disabled="option.disabled"
            :label="option.label"
          />
        </TSelect>
      </TFormItem>
    </TForm>
    <p v-else class="dev-promo-tip">背包暂无未使用的道具卡，请先到积分商城兑换。</p>
    <template #footer>
      <TButton @click="emit('update:open', false)">取消</TButton>
      <TButton
        variant="solid"
        tone="accent"
        :loading="applying"
        :disabled="!options.length || !selectedId"
        @click="emit('confirm')"
      >
        确认使用
      </TButton>
    </template>
  </TDialog>
</template>

<style scoped>
.dev-promo-tip {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--dev-muted);
  line-height: 1.5;
}
</style>
