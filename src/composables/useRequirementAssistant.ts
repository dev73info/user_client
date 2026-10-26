import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import {
  adoptRequirementDraft,
  createRequirementAgentConversation,
  getRequirementAgentConversation,
  listMyRequirementAgentConversations,
  requestRequirementAgentHandoff,
  sendRequirementAgentMessage,
  type RequirementAgentConversation,
  type RequirementAgentConversationDetail,
  type RequirementDraft,
} from '@/api/requirementAgent'
import { describeBackendError } from '@/shared/backendErrorText'
import {
  draftToPublishForm,
  requirementDraftFieldLabel,
  savePendingAgentDraft,
} from '@/shared/requirementAssistant'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

export function useRequirementAssistant() {
  const auth = useAuthStore()
  const router = useRouter()
  const conversations = ref<RequirementAgentConversation[]>([])
  const detail = ref<RequirementAgentConversationDetail | null>(null)
  const draft = ref<RequirementDraft | null>(null)
  const input = ref('')
  const loading = ref(false)
  const sending = ref(false)
  const handingOff = ref(false)
  const adopting = ref(false)
  const error = ref('')
  const messagesRef = ref<HTMLElement | null>(null)

  const conversation = computed(() => detail.value?.conversation ?? null)
  const aiStopped = computed(
    () =>
      conversation.value?.status === 'agent_takeover' || conversation.value?.status === 'closed',
  )
  const published = computed(() => conversation.value?.status === 'published')
  const missingLabels = computed(() =>
    (draft.value?.missing_fields ?? [])
      .map(requirementDraftFieldLabel)
      .filter((label) => label.length > 0),
  )
  const statusLabel = computed(
    () =>
      ({
        ai_active: 'AI 梳理中',
        agent_takeover: '平台客服已接手',
        closed: '会话已结束',
        published: '需求已发布',
      })[conversation.value?.status ?? 'ai_active'] ?? conversation.value?.status,
  )

  function applyDetail(next: RequirementAgentConversationDetail) {
    detail.value = next
    draft.value = next.draft ?? null
    void nextTick(() => {
      if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    })
  }

  async function loadConversations() {
    loading.value = true
    error.value = ''
    try {
      conversations.value = await listMyRequirementAgentConversations(auth.token)
      const first = conversations.value[0]
      if (first) applyDetail(await getRequirementAgentConversation(auth.token, first.id))
    } catch (err) {
      error.value = describeBackendError(err, '加载需求助手会话失败')
    } finally {
      loading.value = false
    }
  }

  function startNewConversation() {
    detail.value = null
    draft.value = null
    input.value = ''
    error.value = ''
  }

  async function send() {
    const content = input.value.trim()
    if (!content || sending.value) return
    sending.value = true
    error.value = ''
    try {
      const next =
        conversation.value === null
          ? await createRequirementAgentConversation(
              auth.token,
              content,
              auth.isDev ? 'dev' : 'user',
            )
          : await sendRequirementAgentMessage(auth.token, conversation.value.id, content)
      applyDetail(next)
      input.value = ''
      conversations.value = await listMyRequirementAgentConversations(auth.token)
    } catch (err) {
      error.value = describeBackendError(err, '发送消息失败')
    } finally {
      sending.value = false
    }
  }

  async function selectConversation(item: RequirementAgentConversation) {
    loading.value = true
    error.value = ''
    try {
      applyDetail(await getRequirementAgentConversation(auth.token, item.id))
    } catch (err) {
      error.value = describeBackendError(err, '加载需求会话详情失败')
    } finally {
      loading.value = false
    }
  }

  async function handoff() {
    if (!conversation.value || handingOff.value) return
    handingOff.value = true
    error.value = ''
    try {
      applyDetail(await requestRequirementAgentHandoff(auth.token, conversation.value.id))
      TMessage.success('已通知平台客服接手')
    } catch (err) {
      error.value = describeBackendError(err, '转人工客服失败')
    } finally {
      handingOff.value = false
    }
  }

  async function adopt() {
    if (!draft.value || adopting.value) return
    adopting.value = true
    error.value = ''
    try {
      await adoptRequirementDraft(auth.token, draft.value.id)
      savePendingAgentDraft(draftToPublishForm(draft.value))
      TMessage.success('草稿已填入发布表单')
      await router.push({ name: 'home', query: { modal: 'publish' } })
    } catch (err) {
      error.value = describeBackendError(err, '采纳需求草稿失败')
    } finally {
      adopting.value = false
    }
  }

  onMounted(() => {
    auth.hydrate()
    if (!auth.token) {
      void router.replace({ name: 'home', query: { modal: 'auth', mode: 'login' } })
      return
    }
    void loadConversations()
  })

  return {
    auth,
    conversations,
    detail,
    draft,
    input,
    loading,
    sending,
    handingOff,
    adopting,
    error,
    messagesRef,
    conversation,
    aiStopped,
    published,
    missingLabels,
    statusLabel,
    loadConversations,
    startNewConversation,
    send,
    selectConversation,
    handoff,
    adopt,
  }
}
