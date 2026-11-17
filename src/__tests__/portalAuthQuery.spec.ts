import { describe, expect, it } from 'vitest'

import {
  buildAuthModalQuery,
  isSafeAuthRedirect,
  resolveAuthReturn,
  stripAuthQuery,
} from '@/shared/auth/portalAuthQuery'

describe('portal auth query', () => {
  it('在当前页 query 上补登录参数，并保留 resource / sale', () => {
    expect(
      buildAuthModalQuery(
        { sale: 'paid', resource: '69' },
        'login',
        '/minecraft/group-2?sale=paid&resource=69',
      ),
    ).toEqual({
      sale: 'paid',
      resource: '69',
      modal: 'auth',
      mode: 'login',
      redirect_to: '/minecraft/group-2?sale=paid&resource=69',
    })
  })

  it('拒绝站外和协议相对地址作为 redirect_to', () => {
    expect(isSafeAuthRedirect('https://evil.example/')).toBe(false)
    expect(isSafeAuthRedirect('//evil.example/')).toBe(false)
    expect(buildAuthModalQuery({}, 'login', '//evil.example/').redirect_to).toBeUndefined()
  })

  it('关闭弹窗只清登录参数，不动页面自己的 query', () => {
    expect(
      stripAuthQuery({
        sale: 'paid',
        resource: '69',
        modal: 'auth',
        mode: 'login',
        redirect_to: '/minecraft/group-2?resource=69',
      }),
    ).toEqual({ sale: 'paid', resource: '69' })
  })

  it('登录完成优先回 redirect_to，否则回当前页', () => {
    expect(
      resolveAuthReturn({
        path: '/minecraft/group-2',
        query: { resource: '69', modal: 'auth', redirect_to: '/minecraft/group-1?resource=1' },
        hash: '',
      }),
    ).toBe('/minecraft/group-1?resource=1')

    expect(
      resolveAuthReturn({
        path: '/minecraft/group-2',
        query: { sale: 'paid', resource: '69', modal: 'auth', mode: 'login' },
        hash: '',
      }),
    ).toEqual({
      path: '/minecraft/group-2',
      query: { sale: 'paid', resource: '69' },
      hash: '',
    })
  })
})
