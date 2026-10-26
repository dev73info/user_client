import { Bell, Connection, Lock, Message, User, Warning } from 'ui_73info'

import { providerLabel } from './accountEntries'
import type { AccountEntry, AccountEntryGroup } from './accountEntries'

export type SecurityRowsState = {
  profileEmail: string
  twoFactorEnabled: boolean
  wechatBound: boolean
  wechatBindingLoading: boolean
  providerBindingLoading: boolean
  boundProviders: readonly string[]
  providerError?: string
}

export function buildSecurityGroups(state: SecurityRowsState): AccountEntryGroup[] {
  const unavailable = Boolean(state.providerError)
  const providerEntry = (provider: 'github' | 'gitee' | 'qq'): AccountEntry => {
    const bound = state.boundProviders.includes(provider)
    return {
      key: `bind:${provider}`,
      title: providerLabel(provider),
      desc: unavailable
        ? '绑定状态未确认，请重试'
        : bound
          ? '已绑定，点击可解除绑定'
          : '绑定后可扫码快捷登录',
      icon: Connection,
      status: unavailable
        ? { text: '状态未知', tone: 'warning' }
        : { text: bound ? '已绑定' : '未绑定', tone: bound ? 'success' : 'info' },
      loading: state.providerBindingLoading,
      locked: unavailable,
    }
  }

  return [
    {
      title: '登录凭证',
      entries: [
        {
          key: 'email',
          title: '修改邮箱',
          desc: state.profileEmail ? `当前邮箱：${state.profileEmail}` : '用于接收验证码与通知',
          icon: Message,
        },
        { key: 'password', title: '修改密码', desc: '修改后其它设备需重新登录', icon: Lock },
        {
          key: 'username',
          title: '修改用户名',
          desc: '用户名同时是登录名，修改后请用新用户名登录',
          icon: User,
        },
        {
          key: 'twoFactor',
          title: '两步验证',
          desc: '登录时额外校验一次邮箱验证码',
          icon: Bell,
          status: {
            text: state.twoFactorEnabled ? '已开启' : '未开启',
            tone: state.twoFactorEnabled ? 'success' : 'info',
          },
        },
      ],
    },
    {
      title: '第三方账号',
      entries: [
        {
          key: 'bind:wechat',
          title: '微信',
          desc: unavailable
            ? '绑定状态未确认，请重试'
            : state.wechatBound
              ? '已绑定，点击可解除绑定'
              : '绑定后可扫码快捷登录',
          icon: Connection,
          locked: unavailable,
          status: unavailable
            ? { text: '状态未知', tone: 'warning' }
            : {
                text: state.wechatBound ? '已绑定' : '未绑定',
                tone: state.wechatBound ? 'success' : 'info',
              },
          loading: state.wechatBindingLoading,
        },
        providerEntry('github'),
        providerEntry('gitee'),
        providerEntry('qq'),
      ],
    },
    {
      title: '危险操作',
      entries: [
        {
          key: 'close',
          title: '注销账号',
          desc: '注销后账号与数据不可恢复',
          icon: Warning,
          danger: true,
        },
      ],
    },
  ]
}
