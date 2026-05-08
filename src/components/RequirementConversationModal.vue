<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import * as userConversationApi from '@/api/conversations'
import * as devConversationApi from '@dev/api/conversations'
import type {
    RequirementConversationDetail,
    RequirementConversationMessage,
} from '@/api/conversations'

const props = defineProps<{
    visible: boolean
    token: string
    requirementId: string
    title?: string
    currentUsername?: string
    apiMode?: 'user' | 'dev'
    displayMode?: 'modal' | 'inline'
}>()

const emit = defineEmits<{
    close: []
    updated: [detail: RequirementConversationDetail]
}>()

const detail = ref<RequirementConversationDetail | null>(null)
const loading = ref(false)
const sending = ref(false)
const draft = ref('')
const errorMessage = ref('')
const messageListRef = ref<HTMLElement | null>(null)

type ConversationApi = {
    getRequirementConversationByRequirement: typeof userConversationApi.getRequirementConversationByRequirement
    sendRequirementConversationMessage: typeof userConversationApi.sendRequirementConversationMessage
}

const conversationApi = computed<ConversationApi>(() =>
    props.apiMode === 'dev' ? devConversationApi : userConversationApi,
)
const conversation = computed(() => detail.value?.conversation ?? null)
const messages = computed(() => detail.value?.messages ?? [])
const canSend = computed(() => draft.value.trim().length > 0 && !sending.value && !loading.value)
const isInline = computed(() => props.displayMode === 'inline')
const closeActionLabel = computed(() => (isInline.value ? '返回列表' : '关闭'))
const participantLabel = computed(() => {
    const item = conversation.value
    if (!item) {
        return ''
    }

    if (props.currentUsername === item.customer) {
        return `开发者：${item.developer}`
    }
    if (props.currentUsername === item.developer) {
        return `用户：${item.customer}`
    }
    return `${item.customer} / ${item.developer}`
})
const lastMessageLabel = computed(() => {
    const item = conversation.value
    if (!item) {
        return ''
    }
    return item.last_message_at ? `最近消息：${item.last_message_at}` : '尚无消息'
})

watch(
    () => [props.visible, props.token, props.requirementId] as const,
    ([visible]) => {
        if (visible) {
            void loadConversation()
            return
        }
        draft.value = ''
        errorMessage.value = ''
    },
    { immediate: true },
)

async function scrollToBottom() {
    await nextTick()
    if (messageListRef.value) {
        messageListRef.value.scrollTop = messageListRef.value.scrollHeight
    }
}

async function loadConversation() {
    if (!props.token || !props.requirementId) {
        return
    }

    loading.value = true
    errorMessage.value = ''
    try {
        detail.value = await conversationApi.value.getRequirementConversationByRequirement(props.token, props.requirementId)
        emit('updated', detail.value)
        await scrollToBottom()
    } catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '加载会话失败'
        detail.value = null
    } finally {
        loading.value = false
    }
}

async function submitMessage() {
    const content = draft.value.trim()
    if (!content || !conversation.value || !props.token) {
        return
    }

    sending.value = true
    errorMessage.value = ''
    try {
        detail.value = await conversationApi.value.sendRequirementConversationMessage(
            props.token,
            conversation.value.conversation_id,
            content,
        )
        emit('updated', detail.value)
        draft.value = ''
        await scrollToBottom()
    } catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '发送消息失败'
    } finally {
        sending.value = false
    }
}

function isMine(message: RequirementConversationMessage) {
    return Boolean(props.currentUsername && message.sender === props.currentUsername)
}

function senderLabel(message: RequirementConversationMessage) {
    return message.sender_role === 'developer' ? '开发者' : '用户'
}

function closeModal() {
    if (sending.value) {
        return
    }
    emit('close')
}

function handleBackdropClick() {
    if (!isInline.value) {
        closeModal()
    }
}
</script>

<template>
    <Teleport to="body" :disabled="isInline">
        <div v-if="visible" class="conversation-modal-wrap" :class="{ 'conversation-modal-wrap--inline': isInline }"
            @click.self="handleBackdropClick">
            <section class="conversation-modal" aria-label="需求沟通会话">
                <header class="conversation-modal__header">
                    <div>
                        <h3>需求沟通</h3>
                        <p>{{ title || conversation?.requirement_title || requirementId }}</p>
                        <div v-if="conversation" class="conversation-modal__meta">
                            <span>{{ participantLabel }}</span>
                            <span>{{ lastMessageLabel }}</span>
                        </div>
                    </div>
                    <div class="conversation-modal__header-actions">
                        <button class="conversation-modal__close" type="button" :disabled="loading"
                            @click="loadConversation">
                            {{ loading ? '刷新中' : '刷新' }}
                        </button>
                        <button class="conversation-modal__close" type="button" @click="closeModal">
                            {{ closeActionLabel }}
                        </button>
                    </div>
                </header>

                <div ref="messageListRef" class="conversation-modal__messages">
                    <div v-if="loading" class="conversation-modal__empty">会话加载中...</div>
                    <div v-else-if="errorMessage" class="conversation-modal__empty conversation-modal__empty--error">
                        <span>{{ errorMessage }}</span>
                        <button type="button" @click="loadConversation">重试</button>
                    </div>
                    <div v-else-if="messages.length === 0" class="conversation-modal__empty">暂无消息</div>
                    <template v-else>
                        <article v-for="message in messages" :key="message.id" class="conversation-message"
                            :class="{ 'conversation-message--mine': isMine(message) }">
                            <div class="conversation-message__meta">
                                <span>{{ senderLabel(message) }} · {{ message.sender }}</span>
                                <time>{{ message.created_at }}</time>
                            </div>
                            <p>{{ message.content }}</p>
                        </article>
                    </template>
                </div>

                <footer class="conversation-modal__composer">
                    <textarea v-model="draft" rows="3" maxlength="5000" placeholder="输入消息"
                        @keydown.ctrl.enter.prevent="submitMessage"></textarea>
                    <div class="conversation-modal__send-box">
                        <span>{{ draft.trim().length }} / 5000</span>
                        <button type="button" :disabled="!canSend" @click="submitMessage">
                            {{ sending ? '发送中...' : '发送' }}
                        </button>
                    </div>
                </footer>
            </section>
        </div>
    </Teleport>
</template>

<style scoped>
.conversation-modal-wrap {
    position: fixed;
    inset: 0;
    z-index: 130;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px;
    background: rgba(15, 23, 42, 0.42);
}

.conversation-modal-wrap--inline {
    position: static;
    inset: auto;
    z-index: auto;
    display: block;
    padding: 0;
    background: transparent;
}

.conversation-modal {
    width: min(720px, 100%);
    max-height: min(760px, calc(100dvh - 36px));
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 18px;
    border: 1px solid rgba(226, 232, 240, 0.95);
    background: #ffffff;
    box-shadow: 0 24px 70px rgba(15, 23, 42, 0.22);
}

.conversation-modal-wrap--inline .conversation-modal {
    width: 100%;
    min-height: 520px;
    max-height: none;
    border-radius: 16px;
    box-shadow: 0 8px 20px rgba(76, 103, 172, 0.06);
}

.conversation-modal__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 20px 14px;
    border-bottom: 1px solid rgba(226, 232, 240, 0.9);
}

.conversation-modal-wrap--inline .conversation-modal__header {
    align-items: center;
    padding: 14px 16px 12px;
}

.conversation-modal__header h3 {
    margin: 0;
    color: #0f172a;
    font-size: 20px;
}

.conversation-modal-wrap--inline .conversation-modal__header h3 {
    font-size: 18px;
}

.conversation-modal__header p {
    margin: 6px 0 0;
    color: #64748b;
    font-size: 13px;
    line-height: 1.5;
}

.conversation-modal-wrap--inline .conversation-modal__header p {
    margin-top: 4px;
}

.conversation-modal__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
    color: #475569;
    font-size: 12px;
}

.conversation-modal__meta span {
    padding: 3px 8px;
    border-radius: 999px;
    background: #f1f5f9;
}

.conversation-modal__header-actions {
    display: flex;
    flex: 0 0 auto;
    gap: 8px;
}

.conversation-modal__close,
.conversation-modal__composer button {
    border: 1px solid rgba(203, 213, 225, 0.95);
    border-radius: 10px;
    background: #ffffff;
    color: #0f172a;
    cursor: pointer;
}

.conversation-modal__close {
    flex: 0 0 auto;
    padding: 7px 12px;
}

.conversation-modal__messages {
    flex: 1;
    min-height: 280px;
    overflow-y: auto;
    padding: 18px 20px;
    background: #f8fafc;
}

.conversation-modal-wrap--inline .conversation-modal__messages {
    min-height: 260px;
    padding: 14px 16px;
}

.conversation-modal__empty {
    display: grid;
    place-items: center;
    min-height: 180px;
    color: #64748b;
}

.conversation-modal__empty--error {
    color: #b42318;
    gap: 12px;
}

.conversation-modal__empty--error button {
    border: 1px solid rgba(180, 35, 24, 0.24);
    border-radius: 10px;
    background: #fff7f5;
    color: #b42318;
    padding: 7px 12px;
    cursor: pointer;
}

.conversation-message {
    width: min(78%, 520px);
    margin-bottom: 14px;
}

.conversation-message--mine {
    margin-left: auto;
}

.conversation-message__meta {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 5px;
    color: #64748b;
    font-size: 12px;
}

.conversation-message p {
    margin: 0;
    padding: 10px 12px;
    border: 1px solid rgba(226, 232, 240, 0.9);
    border-radius: 14px 14px 14px 4px;
    background: #ffffff;
    color: #0f172a;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-word;
}

.conversation-message--mine p {
    border-color: rgba(46, 116, 255, 0.18);
    border-radius: 14px 14px 4px 14px;
    background: #eaf2ff;
}

.conversation-modal__composer {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    padding: 14px 16px;
    border-top: 1px solid rgba(226, 232, 240, 0.9);
    background: #ffffff;
}

.conversation-modal-wrap--inline .conversation-modal__composer {
    padding: 12px 14px;
}

.conversation-modal__send-box {
    align-self: end;
    display: grid;
    gap: 8px;
    justify-items: end;
}

.conversation-modal__send-box span {
    color: #64748b;
    font-size: 12px;
}

.conversation-modal__composer textarea {
    min-height: 72px;
    resize: vertical;
    border: 1px solid rgba(203, 213, 225, 0.95);
    border-radius: 12px;
    padding: 10px 12px;
    color: #0f172a;
    font: inherit;
    line-height: 1.6;
}

.conversation-modal-wrap--inline .conversation-modal__composer textarea {
    min-height: 60px;
}

.conversation-modal__composer button {
    align-self: end;
    min-width: 84px;
    height: 40px;
    padding: 0 16px;
    background: #1f6feb;
    color: #ffffff;
    border-color: #1f6feb;
}

.conversation-modal__composer button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
}

@media (max-width: 640px) {
    .conversation-modal-wrap {
        padding: 10px;
    }

    .conversation-modal-wrap--inline {
        padding: 0;
    }

    .conversation-modal {
        max-height: calc(100dvh - 20px);
        border-radius: 14px;
    }

    .conversation-modal-wrap--inline .conversation-modal {
        min-height: 440px;
        max-height: none;
    }

    .conversation-message {
        width: 100%;
    }

    .conversation-modal__composer {
        grid-template-columns: 1fr;
    }

    .conversation-modal__header {
        flex-direction: column;
    }

    .conversation-modal__header-actions {
        width: 100%;
    }

    .conversation-modal__header-actions button {
        flex: 1;
    }

    .conversation-modal__send-box {
        width: 100%;
        justify-items: stretch;
    }

    .conversation-modal__composer button {
        width: 100%;
    }
}
</style>
