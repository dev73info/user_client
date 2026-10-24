import { describe, expect, it } from 'vitest'

import { overviewItem, type MenuRouteContext, type WorkbenchMenuItem } from '@/shared/workbenchMenu'
import {
  compactRouteTitle,
  conversationLink,
  isActiveChildPage,
  isConversationRouteActive,
  isMenuItemActive,
  isMessagesRouteName,
  menuItemTo,
  messagesAnchorIndexFor,
  messagesRouteNameFor,
  notificationsRouteNameFor,
  resolveWorkbenchTitle,
  workbenchBrandTitleFor,
} from '@/shared/workbenchRoutes'

/** 默认的「停在某个用户端页面」上下文：名字命中、无 hash、不是团队资源入口。 */
function contextOf(overrides: Partial<MenuRouteContext> = {}): MenuRouteContext {
  return { name: 'workbench-account', hash: '', fromTeamResources: false, ...overrides }
}

const itemOf = (overrides: Partial<WorkbenchMenuItem> = {}): WorkbenchMenuItem =>
  ({
    label: '账户详情',
    name: 'workbench-account',
    description: '管理账户',
    ...overrides,
  }) as WorkbenchMenuItem

describe('isMenuItemActive', () => {
  it('名字相同且都没有 hash 时高亮', () => {
    expect(isMenuItemActive(itemOf(), contextOf())).toBe(true)
  })

  it('名字不同不高亮', () => {
    expect(isMenuItemActive(itemOf(), contextOf({ name: 'workbench-coupons' }))).toBe(false)
  })

  it('条目带 hash 时按 hash 精确比对', () => {
    const item = itemOf({ hash: '#security' })

    expect(isMenuItemActive(item, contextOf({ hash: '#security' }))).toBe(true)
    expect(isMenuItemActive(item, contextOf({ hash: '#billing' }))).toBe(false)
  })

  it('不带 hash 的条目在页面内还有 hash 时不高亮（避免同页两个锚点都亮）', () => {
    expect(isMenuItemActive(itemOf(), contextOf({ hash: '#security' }))).toBe(false)
  })

  it('子页面通过 activeNames 命中父条目', () => {
    const resourceItem = itemOf({
      name: 'dev-resource-list',
      activeNames: ['dev-resource-versions'],
    })

    expect(isMenuItemActive(resourceItem, contextOf({ name: 'dev-resource-versions' }))).toBe(true)
  })

  it('从团队资源进版本管理时高亮「团队资源」、不亮「资源项目」', () => {
    const teamResource = itemOf({ name: 'workbench-team-resources' })
    const resourceItem = itemOf({ name: 'dev-resource-list' })
    const context = contextOf({ name: 'dev-resource-versions', fromTeamResources: true })

    expect(isMenuItemActive(teamResource, context)).toBe(true)
    expect(isMenuItemActive(resourceItem, context)).toBe(false)
  })

  it('团队资源标记只在版本 / 编辑主页两页生效', () => {
    const teamResource = itemOf({ name: 'workbench-team-resources' })
    const context = contextOf({ name: 'dev-resource-sold-purchases', fromTeamResources: true })

    expect(isMenuItemActive(teamResource, context)).toBe(false)
  })
})

describe('isActiveChildPage / compactRouteTitle', () => {
  it('停在子页面时才算「当前页属于这条条目」', () => {
    const item = itemOf({ name: 'dev-resource-list', activeNames: ['dev-resource-versions'] })

    expect(isActiveChildPage(item, 'dev-resource-versions')).toBe(true)
    expect(isActiveChildPage(item, 'dev-resource-list')).toBe(false)
    expect(isActiveChildPage(null, 'dev-resource-versions')).toBe(false)
  })

  it('路由标题取最后一段，单段原样返回', () => {
    expect(compactRouteTitle('账户服务/账户详情')).toBe('账户详情')
    expect(compactRouteTitle('账户详情')).toBe('账户详情')
    expect(compactRouteTitle('')).toBe('')
  })
})

describe('resolveWorkbenchTitle', () => {
  it('消息中心优先报会话名，没有会话时退成「消息中心」', () => {
    expect(
      resolveWorkbenchTitle({
        isMessagesRoute: true,
        conversationTitle: '接口联调',
        activeItem: null,
        routeName: 'workbench-messages',
        routeTitle: '消息中心',
      }),
    ).toBe('接口联调')

    expect(
      resolveWorkbenchTitle({
        isMessagesRoute: true,
        conversationTitle: null,
        activeItem: null,
        routeName: 'workbench-messages',
        routeTitle: '消息中心',
      }),
    ).toBe('消息中心')
  })

  it('子页面用路由标题的后半段', () => {
    expect(
      resolveWorkbenchTitle({
        isMessagesRoute: false,
        conversationTitle: null,
        activeItem: itemOf({ name: 'dev-resource-list', activeNames: ['dev-resource-versions'] }),
        routeName: 'dev-resource-versions',
        routeTitle: '资源项目/版本管理',
      }),
    ).toBe('版本管理')
  })

  it('普通页面用命中的条目名', () => {
    expect(
      resolveWorkbenchTitle({
        isMessagesRoute: false,
        conversationTitle: null,
        activeItem: itemOf(),
        routeName: 'workbench-account',
        routeTitle: '账户服务/账户详情',
      }),
    ).toBe('账户详情')
  })

  it('都没有时退回路由标题，再退回工作台总览', () => {
    expect(
      resolveWorkbenchTitle({
        isMessagesRoute: false,
        conversationTitle: null,
        activeItem: null,
        routeName: 'workbench-unknown',
        routeTitle: '某个页面',
      }),
    ).toBe('某个页面')

    // 路由标题是空串（页面没登记 meta.title）时原样返回空串：`??` 不跳过空串，与拆分前一致
    expect(
      resolveWorkbenchTitle({
        isMessagesRoute: false,
        conversationTitle: null,
        activeItem: null,
        routeName: 'workbench-unknown',
        routeTitle: '',
      }),
    ).toBe('')
  })
})

describe('两种工作台各自的路由名', () => {
  it('消息中心 / 系统通知各有一对路由', () => {
    expect(messagesRouteNameFor(false)).toBe('workbench-messages')
    expect(messagesRouteNameFor(true)).toBe('dev-messages')
    expect(notificationsRouteNameFor(false)).toBe('workbench-notifications')
    expect(notificationsRouteNameFor(true)).toBe('dev-notifications')
  })

  it('只有两条消息路由算「停在消息中心」', () => {
    expect(isMessagesRouteName('workbench-messages')).toBe(true)
    expect(isMessagesRouteName('dev-messages')).toBe(true)
    expect(isMessagesRouteName(null)).toBe(false)
  })

  it('品牌行标题按模式取文案', () => {
    expect(workbenchBrandTitleFor(false)).toBe('我的工作台')
    expect(workbenchBrandTitleFor(true)).toBe('开发者工作台')
  })

  it('消息中心插在用户端首组之后、开发者端末组之后', () => {
    expect(messagesAnchorIndexFor(false, 3)).toBe(0)
    expect(messagesAnchorIndexFor(true, 2)).toBe(1)
    expect(messagesAnchorIndexFor(true, 0)).toBe(0)
  })
})

describe('会话链接与高亮', () => {
  it('链接带上需求号作为查询参数', () => {
    expect(conversationLink('dev-messages', 'REQ-001')).toEqual({
      name: 'dev-messages',
      query: { requirement_id: 'REQ-001' },
    })
  })

  it('停在消息中心且需求号一致才高亮', () => {
    expect(isConversationRouteActive('REQ-001', 'REQ-001', true)).toBe(true)
    expect(isConversationRouteActive('REQ-001', 'REQ-002', true)).toBe(false)
    expect(isConversationRouteActive('REQ-001', 'REQ-001', false)).toBe(false)
    // 地址栏里的 query 可能是数组（同名参数出现多次），此时不算命中
    expect(isConversationRouteActive('REQ-001', ['REQ-001'], true)).toBe(false)
  })
})
