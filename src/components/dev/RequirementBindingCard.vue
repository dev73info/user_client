<script setup lang="ts">
import { TButton, TCheckbox, TForm, TFormItem, TOption, TSelect } from 'ui_73info'
import RequirementBindingConfirmPanel from '@/components/dev/RequirementBindingConfirmPanel.vue'
import RequirementBindingNotice from '@/components/dev/RequirementBindingNotice.vue'
import { bindableResourceLabel, type BindableResourceFacts } from '@/shared/devRequirementBinding'

/**
 * 右栏「配置关联资源」：关联方式、可绑定资源、已阅确认、二次确认、提交动作。
 *
 * 「初始化新资源项目」那一支的表单是插槽（`#init`）：它要的字段与标签树都在视图那层的
 * composable 里，绕经这个组件转发一整串 props 只会多一层容易接错的接线。
 *
 * 提交 / 跳转都不在这里：本组件只发 emit，接口实参与路由由 composable 负责。
 */
defineProps<{
  requirementTitle: string
  mode: 'existing' | 'new'
  blockReason: string
  agreementBlocked: boolean
  resourceOptions: BindableResourceFacts[]
  /** 有「已提审 / 已公开」的未绑定资源：要说明它们为什么不能在这里绑。 */
  hasPendingBindable: boolean
  selectedResourceTitle: string
  /** 二次确认里显示的「即将关联到哪个资源」。 */
  resourceLabel: string
  createBlockReason: string
  binding: boolean
  canSubmit: boolean
}>()

const emit = defineEmits<{
  'update:mode': [mode: 'existing' | 'new']
  'resource-change': []
  'review-change': []
  'sign-agreement': []
  cancel: []
  submit: []
}>()

const resourceId = defineModel<number | undefined>('resourceId', { required: true })
const reviewConfirmed = defineModel<boolean>('reviewConfirmed', { required: true })
const finalConfirmed = defineModel<boolean>('finalConfirmed', { required: true })
</script>

<template>
  <div class="dev-card-head">
    <div class="dev-card-head__title-block">
      <span class="dev-filter-label">接取需求</span>
      <h3 class="dev-section-title">配置关联资源</h3>
    </div>
    <div class="dev-card-head__actions">
      <span class="dev-chip">{{ mode === 'existing' ? '已有资源' : '新资源' }}</span>
    </div>
  </div>

  <RequirementBindingNotice
    :reason="blockReason"
    :agreement-blocked="agreementBlocked"
    @sign-agreement="emit('sign-agreement')"
  />

  <TForm label-position="top">
    <TFormItem label="关联方式" required>
      <div class="dev-requirement-hall__mode-switch">
        <button
          type="button"
          class="dev-requirement-hall__mode-button"
          :class="{ 'is-active': mode === 'existing' }"
          @click="emit('update:mode', 'existing')"
        >
          关联已有资源项目
        </button>
        <button
          type="button"
          class="dev-requirement-hall__mode-button"
          :class="{ 'is-active': mode === 'new' }"
          @click="emit('update:mode', 'new')"
        >
          初始化新资源项目
        </button>
      </div>
    </TFormItem>

    <template v-if="mode === 'existing'">
      <TFormItem label="选择开发项目" required>
        <TSelect
          v-model="resourceId"
          filterable
          placeholder="请选择一个未绑定且保持私有的开发项目"
          class="dev-requirement-hall__dialog-field"
          @change="emit('resource-change')"
        >
          <TOption
            v-for="item in resourceOptions"
            :key="item.id"
            :label="bindableResourceLabel(item)"
            :value="item.id"
          />
        </TSelect>
      </TFormItem>

      <p
        v-if="resourceOptions.length === 0"
        class="dev-empty-state dev-requirement-hall__dialog-empty"
      >
        当前没有可直接绑定的私有资源项目。你可以切换到“初始化新资源项目”，先创建一个私有项目后再继续关联。
      </p>
      <p v-else-if="hasPendingBindable" class="dev-empty-state dev-requirement-hall__dialog-empty">
        只有私有且未绑定的资源才能关联需求；已提交审核或已公开的资源不可在此绑定。
      </p>
    </template>

    <!-- 「初始化新资源项目」的表单与标签树：字段状态在视图那层，用插槽直接喂进来 -->
    <template v-else>
      <slot name="init" />
    </template>

    <TFormItem required>
      <TCheckbox v-model="reviewConfirmed" @change="emit('review-change')">
        我已详细阅读需求标题、需求描述、预算、验收标准，并确认当前资源方案适合关联此需求
      </TCheckbox>
    </TFormItem>
  </TForm>

  <RequirementBindingConfirmPanel
    v-if="requirementTitle && (mode === 'new' || selectedResourceTitle)"
    v-model:final-confirmed="finalConfirmed"
    :requirement-title="requirementTitle"
    :resource-label="resourceLabel"
    :review-confirmed="reviewConfirmed"
  />

  <p
    v-if="mode === 'new' && createBlockReason"
    class="dev-empty-state dev-requirement-hall__dialog-empty"
  >
    {{ createBlockReason }}
  </p>

  <div class="dev-requirement-detail__actions">
    <TButton variant="outline" @click="emit('cancel')">取消</TButton>
    <TButton
      variant="solid"
      tone="accent"
      :loading="binding"
      :disabled="!canSubmit"
      @click="emit('submit')"
    >
      {{ mode === 'existing' ? '确认关联' : '初始化并关联' }}
    </TButton>
  </div>
</template>

<style scoped>
.dev-requirement-detail__actions {
  position: sticky;
  bottom: -1px;
  z-index: 1;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 14px;
  border-top: 1px solid var(--dev-line);
  background: linear-gradient(180deg, var(--dev-surface), var(--dev-surface-strong));
}

@container (max-width: 960px) {
  .dev-requirement-detail__actions {
    position: static;
  }
}

@container (max-width: 520px) {
  .dev-requirement-hall__mode-switch {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .dev-requirement-detail__actions {
    position: static;
  }
}

/* R047 断点收敛：原档位 720px → 640px */
@media (max-width: 640px) {
  .dev-requirement-detail__actions {
    align-items: stretch;
    flex-direction: column;
  }

  .dev-requirement-hall__mode-switch {
    grid-template-columns: 1fr;
  }
}
</style>
