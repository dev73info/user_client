<script setup lang="ts">
import type { TicketPriority } from '@/shared/ticketDisplay'
import { TICKET_PRIORITY_OPTIONS } from '@/shared/ticketDisplay'
import { TButton, TDialog, TForm, TFormItem, TInput, TSelect, TOption } from 'ui_73info'

/**
 * 「提交新工单」弹窗：标题 / 分类 / 优先级 / 问题描述四项 + 提交。
 *
 * 弹窗会被 TDialog teleport 到 body，落在两侧工作台的根元素之外，
 * 所以必须自己挂统一层的弹窗类（开发者侧 dev-dialog、用户工作台侧 wb-dialog），
 * 否则弹窗里的主色退回库的默认档，与页面内的按钮不是一个颜色。
 *
 * 组件只收草稿与加载态，提交动作 emit 上抛，校验与接口都在 `useTicketCenter`。
 */
defineProps<{ dev: boolean; creating: boolean }>()

defineEmits<{ submit: [] }>()

const open = defineModel<boolean>('open', { required: true })
const subject = defineModel<string>('subject', { required: true })
const category = defineModel<string>('category', { required: true })
const priority = defineModel<TicketPriority>('priority', { required: true })
const content = defineModel<string>('content', { required: true })
</script>

<template>
  <TDialog
    v-model:open="open"
    title="提交新工单"
    width="720px"
    :class="dev ? 'dev-dialog' : 'wb-dialog'"
  >
    <!-- 表单控件一律用组件库的 TInput / TSelect：裸 input / select / textarea 拿不到统一层的
         控件规格（36px 高、10px 圆角）与令牌配色，同一页里会长出两套输入框；
         优先级原先是自绘下拉，现已改用 TSelect，选项文案照旧。 -->
    <TForm class="compose-grid" label-position="top">
      <TFormItem label="工单标题">
        <TInput v-model="subject" placeholder="例如：尾款支付后资源仍不可见" />
      </TFormItem>
      <TFormItem label="工单分类">
        <TInput v-model="category" placeholder="例如：支付 / 资源 / 账号" />
      </TFormItem>
      <TFormItem label="优先级">
        <TSelect v-model="priority" aria-label="优先级">
          <TOption
            v-for="option in TICKET_PRIORITY_OPTIONS"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </TSelect>
      </TFormItem>
      <TFormItem label="问题描述" class="compose-grid__span">
        <TInput
          v-model="content"
          type="textarea"
          :rows="5"
          placeholder="请描述你遇到的问题、已尝试的操作，以及希望得到的处理结果。"
        />
      </TFormItem>
    </TForm>

    <template #footer>
      <div class="compose-actions">
        <TButton variant="solid" tone="accent" :loading="creating" @click="$emit('submit')">
          提交工单
        </TButton>
      </div>
    </template>
  </TDialog>
</template>

<style scoped>
/* 弹窗表单：三列栅格排版留在本页，控件外观全部交给组件库与统一层令牌 */
.compose-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 18px;
}

.compose-grid__span {
  grid-column: 1 / -1;
}

.compose-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

@media (max-width: 1180px) {
  .compose-grid {
    grid-template-columns: 1fr;
  }
}
</style>
