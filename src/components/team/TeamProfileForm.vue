<script setup lang="ts">
/**
 * 团队资料编辑表单（名称 + 简介）。
 *
 * 表单模型放在组件内、按打开那一刻的资料初始化：父级用 `v-if` 开关，每次点「编辑资料」都是重新挂载，
 * 拿到的必然是当前团队名与简介（保存后再点开也是新值）。模型对象是 `TForm` 的必填参数——
 * `TFormItem` 靠 `prop` 从 `TForm` 的 `model` 上取值校验，没有模型对象就没有字段可校验；
 * 这一页两个字段目前不挂规则（只标「团队名称」必填星号），但让表单持有它要校验的那份数据，
 * 比传一个只读的投影更直接。
 *
 * 组件只受控展示：必填提示、提交与保存中状态都由页面（`useTeamDetail`）给。
 */
import { reactive } from 'vue'
import { TForm, TFormItem, TInput } from 'ui_73info'

import type { TeamProfileInput } from '@/composables/useTeamDetail'

const props = defineProps<{
  initialName: string
  initialDescription: string
  saving: boolean
}>()

const emit = defineEmits<{
  (e: 'submit', payload: TeamProfileInput): void
  (e: 'cancel'): void
}>()

const form = reactive({ name: props.initialName, description: props.initialDescription })

function submit() {
  emit('submit', { name: form.name, description: form.description })
}
</script>

<template>
  <TForm :model="form" class="dev-team-detail__form">
    <TFormItem label="团队名称" required>
      <TInput v-model="form.name" :maxlength="64" placeholder="输入团队名称" />
    </TFormItem>
    <TFormItem label="团队简介">
      <TInput
        v-model="form.description"
        type="textarea"
        :rows="3"
        :maxlength="200"
        show-count
        placeholder="简单描述团队的目的（可选）"
      />
    </TFormItem>
    <div class="dev-team-detail__form-actions">
      <button type="button" class="dev-btn dev-btn--primary" :disabled="saving" @click="submit">
        {{ saving ? '保存中...' : '保存' }}
      </button>
      <button type="button" class="dev-btn dev-btn--ghost" @click="emit('cancel')">取消</button>
    </div>
  </TForm>
</template>

<style scoped>
.dev-team-detail__form {
  flex: 1 1 320px;
  min-width: 0;
}

.dev-team-detail__form-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>
