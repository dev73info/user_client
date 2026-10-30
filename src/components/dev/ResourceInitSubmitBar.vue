<script setup lang="ts">
import { TButton, TIcon, MagicStick } from 'ui_73info'

/**
 * 创建页底部的提交条：左侧是「准备就绪 / 还缺什么」读数，右侧是两条提交动作。
 *
 * 接口资源只有一条「创建接口」（没有公开申请：接口资源不进大厅、没有公开主页），
 * 普通资源可选私有项目或公开申请。读数与按钮的禁用都由父级的 `canSubmit` 一把控制。
 *
 * 协议未签（`needsApiAgreement`）时读数旁多一个小号「签署协议」：提示在页面顶部，
 * 但改完表单才想起没签的人会滚到这儿，不必再滚回去找那个按钮。
 */
defineProps<{
  canSubmit: boolean
  submitBlockReason: string
  isApiKind: boolean
  isVersionSale?: boolean
  submitting: boolean
  entryLabel: string
  selectedTagCount: number
  /** 接口资源未签《接口使用协议》：提交条上补一个小号签署入口 */
  needsApiAgreement?: boolean
}>()

const emit = defineEmits<{
  submit: [mode: 'private' | 'public']
  signAgreement: []
}>()
</script>

<template>
  <footer class="dev-upload-actions dev-upload-actions--split" :class="{ 'is-ready': canSubmit }">
    <section class="dev-submit-summary">
      <div class="dev-submit-summary__row">
        <span class="dev-submit-summary__status">{{
          canSubmit ? '准备就绪' : submitBlockReason
        }}</span>
        <TButton
          v-if="needsApiAgreement"
          variant="outline"
          tone="accent"
          size="sm"
          @click="emit('signAgreement')"
        >
          签署协议
        </TButton>
      </div>
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
        {{ isApiKind ? '创建接口' : isVersionSale ? '创建并发布首版' : '创建私有项目' }}
      </TButton>
      <!-- 两条提交动作原来是蓝实底 + 绿实底并排：同一行两颗「主按钮」互相抢，
          发布公开这一条本来也比私有项目多一步审核。次一级的那条改描边，只在主次明确时保留颜色。 -->
      <TButton
        v-if="!isApiKind"
        variant="outline"
        :disabled="!canSubmit"
        :loading="submitting"
        @click="emit('submit', 'public')"
        ><template #prefix
          ><TIcon><MagicStick /></TIcon
        ></template>
        {{ isVersionSale ? '创建首版并申请公开' : '发布公开项目' }}
      </TButton>
    </div>
  </footer>
</template>
