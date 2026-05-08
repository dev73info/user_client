<script setup lang="ts">
import type { PropType } from 'vue'

defineProps({
    visible: { type: Boolean, default: false },
    modalTitle: { type: String, default: '发布需求' },
    submitText: { type: String, default: '确认发布' },
    loadingText: { type: String, default: '发布中...' },
    publishTitle: { type: [String, Number] as PropType<string | number>, default: '' },
    publishDescription: { type: String, default: '' },
    publishBudget: { type: [String, Number] as PropType<string | number>, default: '' },
    publishAcceptance: { type: String, default: '' },
    publishPaymentMode: { type: String as PropType<'platform_guarantee' | 'self_managed'>, default: 'self_managed' },
    publishLoading: { type: Boolean, default: false },
})

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'submit'): void
    (e: 'update:publishTitle', value: string): void
    (e: 'update:publishDescription', value: string): void
    (e: 'update:publishBudget', value: string | number): void
    (e: 'update:publishAcceptance', value: string): void
    (e: 'update:publishPaymentMode', value: 'platform_guarantee' | 'self_managed'): void
}>()

function updateTitle(event: Event) {
    emit('update:publishTitle', (event.target as HTMLInputElement).value)
}

function updateDescription(event: Event) {
    emit('update:publishDescription', (event.target as HTMLTextAreaElement).value)
}

function updateBudget(event: Event) {
    emit('update:publishBudget', (event.target as HTMLInputElement).value)
}

function updateAcceptance(event: Event) {
    emit('update:publishAcceptance', (event.target as HTMLTextAreaElement).value)
}

function updatePaymentMode(value: 'platform_guarantee' | 'self_managed') {
    emit('update:publishPaymentMode', value)
}
</script>

<template>
    <div v-if="visible" class="auth-modal-wrap" @click.self="emit('close')">
        <section class="auth-modal" :aria-label="`${modalTitle}弹窗`">
            <h3>{{ modalTitle }}</h3>
            <label>
                需求标题 *
                <input :value="publishTitle" type="text" maxlength="60" placeholder="例如：企业官网改版、小程序开发" required
                    @input="updateTitle" />
            </label>
            <label>
                需求描述 *
                <textarea :value="publishDescription" rows="5" maxlength="300" placeholder="请描述你的目标、功能和期望交付时间，便于快速匹配。"
                    required @input="updateDescription"></textarea>
            </label>
            <label>
                预算 *
                <input :value="publishBudget" type="number" min="0" step="0.01" placeholder="如 2000" required
                    @input="updateBudget" />
            </label>
            <label>
                验收标准 *
                <textarea :value="publishAcceptance" rows="3" maxlength="240" placeholder="请填写交付标准、验收节点等内容。" required
                    @input="updateAcceptance"></textarea>
            </label>
            <div class="publish-mode-field">
                <span>发布方式 *</span>
                <div class="publish-mode-options" role="radiogroup" aria-label="发布方式选择">
                    <button type="button" class="publish-mode-option"
                        :class="{ active: publishPaymentMode === 'self_managed' }"
                        @click="updatePaymentMode('self_managed')">
                        <strong>无平台担保</strong>
                        <small>平台内协作，付款双方另行约定</small>
                    </button>
                    <button type="button" class="publish-mode-option"
                        :class="{ active: publishPaymentMode === 'platform_guarantee' }"
                        @click="updatePaymentMode('platform_guarantee')">
                        <strong>平台担保</strong>
                        <small>按平台定金与尾款流程推进</small>
                    </button>
                </div>
            </div>
            <div class="auth-modal-actions">
                <button class="auth-btn ghost" type="button" @click="emit('close')">取消</button>
                <button class="auth-btn solid" type="button" :disabled="publishLoading" @click="emit('submit')">
                    {{ publishLoading ? loadingText : submitText }}
                </button>
            </div>
        </section>
    </div>
</template>

<style scoped>
.publish-mode-field {
    display: grid;
    gap: 8px;
}

.auth-modal {
    overflow-y: auto;
}

.publish-mode-field>span {
    font-size: 14px;
    color: #374151;
}

.publish-mode-options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
}

.publish-mode-option {
    min-height: 78px;
    padding: 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    background: #fff;
    color: #111827;
    text-align: left;
    cursor: pointer;
}

.publish-mode-option.active {
    border-color: #2563eb;
    background: #eff6ff;
}

.publish-mode-option strong,
.publish-mode-option small {
    display: block;
}

.publish-mode-option small {
    margin-top: 6px;
    color: #6b7280;
    line-height: 1.4;
}

@media (max-width: 640px) {
    .publish-mode-options {
        grid-template-columns: 1fr;
    }
}
</style>
