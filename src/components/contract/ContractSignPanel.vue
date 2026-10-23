<script setup lang="ts">
import type { PartyDisplay } from '@/shared/contractSign'

/**
 * 签署身份与签署动作条。
 *
 * 只吃展示字段、只发 emit：去实名认证是站内路由跳转、发起签署要整页跳爱签，
 * 两件事都由视图执行，组件不碰 `router` / `window.location`。
 */
defineProps<{
  canSignContract: boolean
  canSubmitSign: boolean
  signing: boolean
  signer: PartyDisplay | null
  signerIdentityReady: boolean
  requirementArchived: boolean
  archiveSignBlockedMessage: string
  showBecomeDeveloper: boolean
  /** 工作台外壳下的版式微调（原 `.page-shell--workbench .sign-panel`）。 */
  workbench: boolean
}>()

const emit = defineEmits<{
  realname: []
  sign: []
  'become-developer': []
}>()

/** 发起签署时是否短信通知签署人（默认不通知）。 */
const notice = defineModel<boolean>('notice', { required: true })
</script>

<template>
  <div class="sign-area" :class="{ 'is-workbench': workbench }">
    <section v-if="canSignContract" class="sign-panel">
      <div class="sign-panel__identity">
        <h3>本次签署身份</h3>
        <dl v-if="signer" class="signer-fields">
          <div>
            <dt>实名姓名</dt>
            <dd>{{ signer.legalName }}</dd>
          </div>
          <div>
            <dt>身份证号</dt>
            <dd>{{ signer.idCardNo }}</dd>
          </div>
          <div>
            <dt>平台账户</dt>
            <dd>{{ signer.username }} / {{ signer.email }}</dd>
          </div>
        </dl>
        <p v-if="!signerIdentityReady" class="identity-warning">实名认证审核通过后才能签署合同。</p>
        <button
          v-if="!signerIdentityReady"
          type="button"
          class="btn-realname"
          @click="emit('realname')"
        >
          去实名认证
        </button>
      </div>
    </section>

    <div v-if="canSignContract || showBecomeDeveloper" class="contract-actions">
      <label v-if="canSignContract" class="notice-toggle">
        <input v-model="notice" type="checkbox" />
        <span>短信通知签署</span>
      </label>
      <button
        v-if="canSignContract"
        class="btn-primary"
        :disabled="!canSubmitSign"
        @click="emit('sign')"
      >
        {{ signing ? '签署中…' : '开始签署' }}
      </button>
      <span
        v-if="requirementArchived"
        class="badge-pending"
        data-testid="contract-archive-locked-note"
      >
        {{ archiveSignBlockedMessage }}
      </span>
      <button v-if="showBecomeDeveloper" class="btn-primary" @click="emit('become-developer')">
        签署完成，成为开发者
      </button>
    </div>
  </div>
</template>

<style scoped>
.sign-panel {
  border: 1px solid var(--73-warning);
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1.2rem;
  background: var(--73-warning-soft);
}

.is-workbench .sign-panel {
  background: var(--73-surface-strong);
  border-color: var(--73-ink-disabled);
}

.sign-panel__identity {
  margin-bottom: 1rem;
}

.sign-panel h3 {
  margin: 0 0 0.65rem;
  color: var(--73-ink);
  font-size: 1.02rem;
  font-weight: 800;
}

.signer-fields {
  display: grid;
  gap: 0.62rem;
  margin: 0;
}

.signer-fields div {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 0.6rem;
  align-items: baseline;
}

.signer-fields dt {
  color: var(--73-ink-muted);
  font-size: 0.86rem;
}

.signer-fields dd {
  margin: 0;
  color: var(--73-ink);
  font-size: 0.94rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.identity-warning {
  margin: 0.7rem 0 0;
  color: var(--73-danger);
  font-size: 0.9rem;
  font-weight: 700;
}

.btn-realname {
  display: inline-flex;
  align-items: center;
  margin-top: 0.75rem;
  padding: 8px 20px;
  border: 1px solid var(--73-accent-soft);
  border-radius: 6px;
  background: var(--73-accent-soft);
  color: var(--73-accent);
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 140ms ease,
    border-color 140ms ease,
    transform 140ms ease;
}

.btn-realname:hover {
  background: var(--73-app-accent-soft-hover);
  border-color: var(--73-accent);
  transform: translateY(-1px);
}

.contract-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding-top: 1rem;
  border-top: 1px solid var(--73-border);
}

.notice-toggle {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--73-ink-soft);
  font-size: 0.9rem;
  cursor: pointer;
  user-select: none;
}

.notice-toggle input[type='checkbox'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--73-warning);
}

.btn-primary {
  min-height: 42px;
  padding: 0.75rem 1.8rem;
  background: var(--73-warning);
  color: var(--73-surface-strong);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.98rem;
  font-weight: 800;
  box-shadow: 0 10px 18px color-mix(in srgb, var(--73-warning) 22%, transparent);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 工作台外壳下的按钮配色（原 `.page-shell--workbench .btn-primary`） */
.is-workbench .btn-primary {
  background: var(--73-success);
  border-color: var(--73-success);
  color: var(--73-surface-strong);
  box-shadow: none;
}

.badge-pending {
  display: inline-block;
  padding: 0.55rem 1rem;
  background: var(--73-warning-soft);
  color: var(--73-danger);
  border: 1px solid var(--73-warning);
  border-radius: 999px;
  font-size: 0.9rem;
  font-weight: 800;
}

@media (max-width: 640px) {
  .signer-fields div {
    grid-template-columns: 1fr;
    gap: 0.2rem;
  }
}
</style>
