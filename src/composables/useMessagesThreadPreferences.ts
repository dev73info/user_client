import { ref } from 'vue'
import { TMessage } from 'ui_73info'

import {
  listThreadPreferences,
  updateThreadPreference,
  type ThreadPreference,
} from '@/api/conversations'
import type { MessageThread } from '@/shared/messagesThreads'

/**
 * 消息中心会话行的置顶 / 删除偏好。
 *
 * 偏好按「需求编号」存，已开启会话与「会话待开启」行共用一套；删除只影响本人，
 * 新消息到达后由后端按最后消息时间恢复，前端在收到会话更新时就地清掉隐藏标记。
 */
export function useMessagesThreadPreferences(token: () => string) {
  const preferences = ref<Record<string, ThreadPreference>>({})

  function reset() {
    preferences.value = {}
  }

  async function load() {
    const rows = await listThreadPreferences(token())
    preferences.value = Object.fromEntries(
      rows.map((preference) => [preference.requirement_id, preference]),
    )
  }

  /** 会话有新消息：与后端「hidden_at 早于最后一条消息即恢复」同口径。 */
  function clearHidden(requirementId: string) {
    const current = preferences.value[requirementId]
    if (!current?.hidden) {
      return
    }
    preferences.value = {
      ...preferences.value,
      [requirementId]: { ...current, hidden: false },
    }
  }

  function restore(requirementId: string, previous: ThreadPreference | undefined) {
    if (previous) {
      preferences.value = { ...preferences.value, [requirementId]: previous }
      return
    }
    const next = { ...preferences.value }
    delete next[requirementId]
    preferences.value = next
  }

  /** 置顶 / 取消置顶：先改本地再落库，失败回滚。 */
  async function setPinned(thread: MessageThread, pinned: boolean) {
    const previous = preferences.value[thread.requirementId]
    preferences.value = {
      ...preferences.value,
      [thread.requirementId]: {
        requirement_id: thread.requirementId,
        pinned,
        hidden: previous?.hidden ?? false,
      },
    }

    try {
      await updateThreadPreference(token(), thread.requirementId, { pinned })
    } catch (error) {
      restore(thread.requirementId, previous)
      TMessage.error(error instanceof Error ? error.message : '保存会话偏好失败')
    }
  }

  /** 删除（从我这里隐藏）：先移出列表再落库，失败放回。`onRemoved` 用于收起已选中的会话。 */
  async function remove(thread: MessageThread, onRemoved?: () => void) {
    const previous = preferences.value[thread.requirementId]
    preferences.value = {
      ...preferences.value,
      [thread.requirementId]: {
        requirement_id: thread.requirementId,
        pinned: previous?.pinned ?? false,
        hidden: true,
      },
    }
    onRemoved?.()

    try {
      await updateThreadPreference(token(), thread.requirementId, { hidden: true })
    } catch (error) {
      restore(thread.requirementId, previous)
      TMessage.error(error instanceof Error ? error.message : '删除会话失败')
    }
  }

  return { preferences, reset, load, clearHidden, setPinned, remove }
}
