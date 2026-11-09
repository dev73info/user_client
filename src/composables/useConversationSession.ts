import { computed, nextTick, onBeforeUnmount, ref } from 'vue'

import * as conversationApi from '@/api/conversations'
import type { RequirementConversationDetail } from '@/api/conversations'
import { dispatchConversationRead } from '@/shared/conversationEvents'

export type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'error'

/**
 * 会话 session 的取数策略。
 *
 * 需求会话按需求编号打开（后端会补建），插件咨询按资源编号补建、或按会话编号读取；
 * 两种场景共用同一套「载入 / 已读上报 / SSE 续传 / 断线补拉」逻辑，差异全部收在这里。
 */
export type ConversationSessionSources = {
  token: string
  visible: boolean
  /** 是否已经拿到打开会话所需的主体（需求号 / 资源号 / 会话号）。 */
  hasSubject: boolean
  /** 载入当前会话的完整详情（需求场景会顺带补建会话）。 */
  loadDetail: () => Promise<RequirementConversationDetail>
  /** 实时推送载荷是不是当前这条会话。 */
  matchesRealtime: (payload: RequirementConversationDetail) => boolean
  /**
   * 载入成功后的附加判定（需求会话用来读「超期归档」标记）。
   * 返回 `true` 表示只读归档；返回 `false` / 不实现表示可正常发送。
   */
  afterLoad?: (detail: RequirementConversationDetail) => Promise<boolean>
  /** 详情被整体替换之后回调：父组件把详情 emit 出去，自己不再另存一份。 */
  onUpdated: (detail: RequirementConversationDetail) => void
  /** 时间线容器（滚到底部用）。容器还在父组件里，这里只要一个取用口。 */
  scrollContainer: () => HTMLElement | null
}

/**
 * 会话的载入、已读上报与实时续传（需求会话与插件咨询共用）。
 *
 * 详情是这里的唯一真源，组件把 `detail` 读出去渲染时间线；拿到新详情就 `onUpdated`
 * 通知父组件 emit。已读上报按「已报过的最大消息 id」去重，实时流断线重连后补拉一次全量。
 */
export function useConversationSession(readSources: () => ConversationSessionSources) {
  const detail = ref<RequirementConversationDetail | null>(null)
  const loading = ref(false)
  /**
   * 「整块错误态」只留给**载入会话失败**：模板里它是时间线的替代分支（`v-else-if="errorMessage"`），
   * 一旦被写入，已经收到的消息会整条从界面上消失，只剩「空态 + 重试」。
   *
   * 发送失败曾经也往这里写，于是发一条消息失败一次，用户就看不到自己刚发的内容，
   * 点「重试」还会重拉整个会话。发送失败的提示因此拆到作曲器自己的 `sendError`。
   */
  const errorMessage = ref('')
  const realtimeStatus = ref<RealtimeStatus>('idle')
  const realtimeError = ref('')
  /** 业务对象是否进入只读归档（目前只有需求会话有这个概念）。 */
  const archived = ref(false)
  let stopRealtimeEvents: (() => void) | null = null
  /** 已成功上报过已读的最大消息 id：同一个位置不重复请求（见 reportConversationRead）。 */
  const lastReportedReadId = ref(0)

  const conversation = computed(() => detail.value?.conversation ?? null)
  const messages = computed(() => detail.value?.messages ?? [])
  const conversationClosed = computed(() => conversation.value?.status === 'closed')

  /**
   * 滚到时间线最底部（最新一条）。
   *
   * ponytail: 只滚一次，不做「贴底跟随」。作曲器里的提示文案与快捷操作晚一两帧才定型，
   * 消息区被挤矮后这次滚动会差最后几十像素（最多遮住最新卡片的底边），要彻底钉住底部
   * 得上 ResizeObserver；目前差量在可视范围内，先不引入。
   */
  async function scrollToBottom() {
    await nextTick()
    const container = readSources().scrollContainer()
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }

  async function load() {
    const sources = readSources()
    if (!sources.token || !sources.hasSubject) {
      return
    }

    loading.value = true
    errorMessage.value = ''
    try {
      const next = await sources.loadDetail()
      detail.value = next
      sources.onUpdated(next)
      void reportConversationRead()
      // 读一次业务对象拿「超期锁定 / 已清除」标记。失败不阻断会话。
      archived.value = sources.afterLoad ? await sources.afterLoad(next) : false
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '加载会话失败'
      detail.value = null
      archived.value = false
    } finally {
      loading.value = false
    }
    // 必须等 loading 关掉之后再滚：加载态里消息列表被「会话加载中」占位块取代，容器没有
    // 可滚动高度，此时赋值 scrollTop 会被浏览器夹回 0，数据回来后就停在时间线最上面，
    // 最新的卡片（如结单）要手动往下滚才看得见。
    await scrollToBottom()
  }

  /**
   * 上报已读：打开会话、断线补拉、以及实时收到新消息之后各报一次。
   *
   * 报的是「我这侧的已读位置」，所以用已成功上报过的最大消息 id 去重——同一个位置不重复请求，
   * 只有收到更新的消息时才再报一次。成败都不打扰用户：失败时下次进会话或下一条消息会再报，
   * 且「未读角标」始终以服务端为准，报失败不会把角标算少。
   */
  async function reportConversationRead() {
    const { token } = readSources()
    const item = conversation.value
    const newest = messages.value[messages.value.length - 1]
    if (!token || !item || !newest || newest.id <= lastReportedReadId.value) {
      return
    }

    try {
      await conversationApi.markRequirementConversationRead(token, item.conversation_id)
      lastReportedReadId.value = newest.id
      // 角标挂在工作台外壳、会话列表挂在这一页上，两者都不在父子链上，只能广播
      dispatchConversationRead({
        conversationId: item.conversation_id,
        requirementId: item.requirement_id,
      })
    } catch {
      // 上报失败不打扰用户：下次打开会话或下一条消息会再报一次
    }
  }

  /**
   * 断线重连后补一次全量：实时流只推「连上之后」发生的事件，断线期间平台写入的卡片
   * 与双方消息都不会补发，不重拉就会一直停在上次连上那一刻（例如结单卡片始终不出现）。
   * 与 load 的区别是不置 loading，避免把正在看的时间线换成加载态、顺手禁掉输入框。
   */
  async function syncAfterRealtimeReconnect() {
    const sources = readSources()
    if (!sources.token || !sources.hasSubject) {
      return
    }

    try {
      const next = await sources.loadDetail()
      detail.value = next
      sources.onUpdated(next)
      void reportConversationRead()
      await scrollToBottom()
    } catch {
      // 补拉失败不打扰用户：下一次重连或手动刷新会再试
    }
  }

  function applyRealtimeDetail(payload: RequirementConversationDetail) {
    if (!readSources().matchesRealtime(payload)) {
      return
    }

    applyDetail(payload)
    void reportConversationRead()
    void scrollToBottom()
  }

  /** 整体替换详情并通知父组件（发消息、表决这些「拿到一份新详情」的路径共用这一处）。 */
  function applyDetail(next: RequirementConversationDetail) {
    detail.value = next
    readSources().onUpdated(next)
  }

  function startRealtime() {
    const sources = readSources()
    if (!sources.token || !sources.hasSubject) {
      realtimeStatus.value = 'idle'
      return
    }

    realtimeStatus.value = 'connecting'
    realtimeError.value = ''
    stopRealtimeEvents = conversationApi.subscribeRequirementConversationEvents(sources.token, {
      onUpdate: applyRealtimeDetail,
      onOpen: () => {
        realtimeStatus.value = 'connected'
        realtimeError.value = ''
      },
      onReconnect: () => {
        // 断线期间可能已经写入卡片/消息，重连后补拉一次，避免时间线停在断线前的样子
        void syncAfterRealtimeReconnect()
      },
      onClose: () => {
        const current = readSources()
        if (current.visible && current.token) {
          realtimeStatus.value = 'connecting'
        }
      },
      onError: (error) => {
        realtimeStatus.value = 'error'
        realtimeError.value = error.message
      },
    })
  }

  function stopRealtime() {
    if (stopRealtimeEvents) {
      stopRealtimeEvents()
      stopRealtimeEvents = null
    }
    realtimeStatus.value = 'idle'
    realtimeError.value = ''
  }

  /** 换了会话就重新开始报到已读：上一条会话报过的消息 id 与本会话无关。 */
  function resetReadMarker() {
    lastReportedReadId.value = 0
  }

  onBeforeUnmount(stopRealtime)

  return {
    detail,
    loading,
    errorMessage,
    realtimeStatus,
    realtimeError,
    archived,
    conversation,
    messages,
    conversationClosed,
    scrollToBottom,
    load,
    reportConversationRead,
    startRealtime,
    stopRealtime,
    resetReadMarker,
    applyDetail,
  }
}
