<script setup lang="ts">
import { TButton, TIcon, MagicStick } from 'ui_73info'

/**
 * 创建页底部的提交条：左侧是「准备就绪 / 还缺什么」读数，右侧是两条提交动作。
 *
 * 接口资源只有一条「创建接口」（没有公开申请：接口资源不进大厅、没有公开主页），
 * 普通资源可选私有项目或公开申请。读数与按钮的禁用都由父级的 `canSubmit` 一把控制。
 */
defineProps<{
  canSubmit: boolean
  submitBlockReason: string
  isApiKind: boolean
  submitting: boolean
  entryLabel: string
  selectedTagCount: number
}>()

const emit = defineEmits<{
  submit: [mode: 'private' | 'public']
}>()
</script>

<template>
  <footer class="dev-upload-actions dev-upload-actions--split" :class="{ 'is-ready': canSubmit }">
    <section class="dev-submit-summary">
      <span class="dev-submit-summary__status">{{
        canSubmit ? '准备就绪' : submitBlockReason
      }}</span>
      <span class="dev-submit-summary__meta">{{
        isApiKind ? '接口资源 · 原创' : `${entryLabel} · ${selectedTagCount} 个标签`
      }}</span>
    </section>
    <div class="dev-upload-actions__buttons">
      <TButton
        variant="solid"
        tone="accent"
        :disabled="!canSubmit"
        :loading="submitting"
        @click="emit('submit', 'private')"
        ><template #prefix
          ><TIcon><MagicStick /></TIcon
        ></template>
        {{ isApiKind ? '创建接口' : '创建私有项目' }}
      </TButton>
      <TButton
        v-if="!isApiKind"
        variant="solid"
        tone="success"
        :disabled="!canSubmit"
        :loading="submitting"
        @click="emit('submit', 'public')"
        ><template #prefix
          ><TIcon><MagicStick /></TIcon
        ></template>
        发布公开项目
      </TButton>
    </div>
  </footer>
</template>
