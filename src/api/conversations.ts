import { apiUrl, authHeader, requestJson } from '@/api/http'
import { createConversationApi, type RequirementConversationEventCallbacks } from '@/shared/conversations'

export type {
  ConversationConsent,
  ConversationHistoryDisclosure,
  ConversationHistoryDisclosureBrief,
  ConversationHistorySegment,
  RequirementConversation,
  RequirementConversationDetail,
  RequirementConversationEventCallbacks,
  RequirementConversationMessage,
} from '@/shared/conversations'

export const {
  listRequirementConversations,
  getRequirementConversationByRequirement,
  sendRequirementConversationMessage,
  requestRequirementHistoryDisclosure,
  listConversationHistoryDisclosures,
  respondConversationHistoryDisclosure,
  subscribeRequirementConversationEvents,
} = createConversationApi({ apiUrl, authHeader, requestJson })
