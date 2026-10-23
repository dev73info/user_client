/**
 * 需求沟通会话：会话列表、按需求取会话、发消息，以及 `/conversations/events` 实时流。
 *
 * 实时流用 fetch 读流（见 `src/shared/api/sse.ts`），所以可以在 mock 里手写：
 * 连接后先推一条当前会话快照，之后只发注释行当心跳，保持连接不空转，
 * 页面上的「已连接」状态与断线重连逻辑都能看到真实表现。
 * 对方不会真的回消息——mock 没有第二个在线用户。
 *
 * 会话内存态与构造函数分在 `conversations/helpers.ts`，路由表在 `conversations/routes.ts`，
 * 本文件只把它们接起来：路径、note、处理逻辑都没动。
 */

import { defineRouteTable, type MockRoute } from '../router'

import { conversationRoutes as conversationRouteList } from './conversations/routes'

const routes: MockRoute[] = [...conversationRouteList]

export const conversationRoutes = defineRouteTable('conversations', routes)
