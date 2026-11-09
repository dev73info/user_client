import { apiUrl, authHeader, requestJson, requestVoid } from '@/api/http'
import {
  createConversationApi,
  type RequirementConversationEventCallbacks,
} from '@/shared/conversations'
import { createConversationDetailApi } from '@/shared/conversationDetailApi'
import { createConversationPreferenceApi } from '@/shared/conversationPreferences'

export type {
  ConversationConsent,
  ConversationHistoryDisclosure,
  ConversationHistoryDisclosureBrief,
  ConversationHistorySegment,
  ConversationScene,
  MarkConversationReadResponse,
  RequirementConversation,
  RequirementConversationDetail,
  RequirementConversationEventCallbacks,
  RequirementConversationMessage,
} from '@/shared/conversations'
export type { ThreadPreference } from '@/shared/conversationPreferences'

export const {
  listRequirementConversations,
  getRequirementConversationByRequirement,
  sendRequirementConversationMessage,
  requestRequirementHistoryDisclosure,
  listConversationHistoryDisclosures,
  respondConversationHistoryDisclosure,
  markRequirementConversationRead,
  subscribeRequirementConversationEvents,
} = createConversationApi({ apiUrl, authHeader, requestJson })

export const { getConversationDetail, getResourceConversation } = createConversationDetailApi({
  authHeader,
  requestJson,
})

export const { listThreadPreferences, updateThreadPreference } = createConversationPreferenceApi({
  authHeader,
  requestJson,
  requestVoid,
})
