<script setup lang="ts">
import { PropType } from 'vue'

const props = defineProps({
    visible: { type: Boolean, default: false },
    publishTitle: { type: [String, Number] as PropType<string | number>, default: '' },
    publishDescription: { type: String, default: '' },
    publishBudget: { type: [String, Number] as PropType<string | number>, default: '' },
    publishAcceptance: { type: String, default: '' },
    publishLoading: { type: Boolean, default: false },
})

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'submit'): void
    (e: 'update:publishTitle', value: string): void
    (e: 'update:publishDescription', value: string): void
    (e: 'update:publishBudget', value: string | number): void
    (e: 'update:publishAcceptance', value: string): void
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
</script>

<template>
    <div v-if="visible" class="auth-modal-wrap" @click.self="emit('close')">
        <section class="auth-modal" aria-label="发布需求弹窗">
            <h3>发布需求</h3>
            <label>
                需求标题
                <input :value="publishTitle" type="text" maxlength="60" placeholder="例如：企业官网改版、小程序开发"
                    @input="updateTitle" />
            </label>
            <label>
                需求描述
                <textarea :value="publishDescription" rows="5" maxlength="300" placeholder="请描述你的目标、功能和期望交付时间，便于快速匹配。"
                    @input="updateDescription"></textarea>
            </label>
            <label>
                预算
                <input :value="publishBudget" type="number" min="0" step="0.01" placeholder="如 2000"
                    @input="updateBudget" />
            </label>
            <label>
                验收标准
                <textarea :value="publishAcceptance" rows="3" maxlength="240" placeholder="可填写交付标准、验收节点等（选填）。"
                    @input="updateAcceptance"></textarea>
            </label>
            <div class="auth-modal-actions">
                <button class="auth-btn ghost" type="button" @click="emit('close')">取消</button>
                <button class="auth-btn solid" type="button" :disabled="publishLoading" @click="emit('submit')">
                    {{ publishLoading ? '发布中...' : '确认发布' }}
                </button>
            </div>
        </section>
    </div>
</template>
