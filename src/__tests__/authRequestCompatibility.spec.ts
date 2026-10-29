import { describe, expect, it } from 'vitest'

import { buildAuthBody } from '@/shared/auth/requestBody'

describe('buildAuthBody', () => {
  it('登录同时提交密码摘要和 1.0 迁移兼容字段', () => {
    expect(
      buildAuthBody('/auth/login', {
        username: 'legacy-user',
        password: 'Secret123',
        requestDevRole: false,
      }),
    ).toEqual({
      username: 'legacy-user',
      password: '5c90b96a75d4f9d5a1cfaa6f532afdc8',
      legacy_password: 'Secret123',
    })
  })

  it('注册不携带登录专用的旧密码字段', () => {
    const body = buildAuthBody('/auth/register', {
      username: 'new-user',
      password: 'Secret123',
      email: 'new@example.com',
      emailCode: '123456',
      requestDevRole: false,
    })

    expect(body).not.toHaveProperty('legacy_password')
  })
})
