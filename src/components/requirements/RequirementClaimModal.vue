<script setup lang="ts">
import type { RequirementItem } from '@/api/requirements'

/**
 * 「转为我的资源」弹窗：确认 → 提交中 → 已转换，同一弹窗按 `step` 切内容。
 *
 * 纯展示：请求、`describeClaimResourceError` 的分档、转换成功后的角色刷新
 * （`auth.fetchProfile(true)`，后端可能刚补 `dev`）都在视图；**跳转也在视图**——
 * 「去开发者工作台查看」只 emit `go-dev-resource-list`，组件不碰 router。
 *
 * 样式：`.modal-wrap` / `.pay-modal` 是全局的（`styles/modal.css`），转换须知那三条
 * `.pay-modal .claim-notes*` 原本写在 MyRequirementsView 的 scoped 块里，拆成组件后
 * scoped 属性对不上会静默失效，已逐条搬进 `styles/profile.css`（选择器与视觉一字不改）。
 */
const props = defineProps<{
  /** 与 `claimConfirmTarget` 一起判开合：两者都成立才渲染（同原来模板的 `v-if`）。 */
  visible: boolean
  requirement: RequirementItem | null
  /** `confirm` 未转换（给须知与确认按钮）；`done` 已转换（留一个去工作台的跳转）。 */
  step: 'confirm' | 'done'
  /** 转换请求在跑：按钮置灰 + 文案换成「转换中...」，遮罩点击也由视图那边拦住。 */
  loading: boolean
}>()

const emit = defineEmits<{
  close: []
  confirm: []
  goDevResourceList: []
}>()
</script>

<template>
  <div v-if="props.visible && props.requirement" class="modal-wrap" @click.self="emit('close')">
    <section class="pay-modal" aria-label="转为我的资源弹窗">
      <template v-if="props.step === 'confirm'">
        <h3>转为我的资源</h3>
        <p class="pay-line"><strong>需求标题：</strong>{{ props.requirement.title }}</p>
        <p class="pay-line"><strong>需求编号：</strong>{{ props.requirement.requirement_id }}</p>
        <p v-if="props.requirement.bound_resource_title" class="pay-line">
          <strong>交付资源：</strong>{{ props.requirement.bound_resource_title }}
        </p>
        <ul class="claim-notes" aria-label="转换须知">
          <li>这一步<strong>不可撤销</strong>：资源归你所有，开发者那边不再把它当作自己的资源。</li>
          <li>转换后这笔需求的会话将关闭，双方都不能再发言，但都仍能查看全部历史。</li>
          <li>若你还没有开发者身份，会自动开通，以便在开发者工作台管理该资源。</li>
        </ul>

        <div class="actions">
          <button class="ghost" type="button" :disabled="props.loading" @click="emit('close')">
            返回
          </button>
          <button
            class="ghost primary"
            type="button"
            :disabled="props.loading"
            @click="emit('confirm')"
          >
            {{ props.loading ? '转换中...' : '确认转换' }}
          </button>
        </div>
      </template>
      <template v-else>
        <h3>已转为我的资源</h3>
        <p class="pay-line"><strong>需求标题：</strong>{{ props.requirement.title }}</p>
        <p class="tip">
          资源已归入你的名下，会话已关闭（仅供查看）。可以到开发者工作台的「资源列表」继续管理它。
        </p>

        <div class="actions">
          <button class="ghost" type="button" @click="emit('close')">留在这里</button>
          <button class="ghost primary" type="button" @click="emit('goDevResourceList')">
            去开发者工作台查看
          </button>
        </div>
      </template>
    </section>
  </div>
</template>
