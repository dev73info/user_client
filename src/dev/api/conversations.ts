import { apiUrl, authHeader, requestJson } from '@dev/api/http'
import { createConversationApi, type RequirementConversationEventCallbacks } from '@/shared/conversations'

export type {
  RequirementConversation,
  RequirementConversationDetail,
  RequirementConversationEventCallbacks,
  RequirementConversationMessage,
} from '@/shared/conversations'

export const {
  listRequirementConversations,
  getRequirementConversationByRequirement,
  sendRequirementConversationMessage,
  subscribeRequirementConversationEvents,
} = createConversationApi({ apiUrl, authHeader, requestJson })
