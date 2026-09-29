import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 电签担保可用性的缓存口径。
 *
 * 这里钉住的是一组实测踩过的行为：`PublishModal` 在首页就是挂载状态
 * （`visible` 只是内层 v-if），`onMounted` 那次请求往往赶在自动登录之前，
 * 拿到的是**匿名身份**的结果（灰度期间 `escrowAllowed` 恒为 false）。
 * 一旦这个答案被当成结论缓存下来，登录之后就再也不会重问，
 * 「电签担保」在整个页面会话里都不会出现——所以匿名答案不能落缓存。
 */

const mocks = vi.hoisted(() => ({
  availability: vi.fn(),
  token: { value: '' as string },
}))

vi.mock('@/api/adapay', () => ({
  getAdapayAvailability: mocks.availability,
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    hydrate: () => undefined,
    get token() {
      return mocks.token.value
    },
  }),
}))

type AvailabilityModule = typeof import('@/shared/adapayAvailability')

/** 模块级缓存是单例状态，每个用例都重新导入一份干净的。 */
async function freshModule(): Promise<AvailabilityModule> {
  vi.resetModules()
  return import('@/shared/adapayAvailability')
}

function availability(escrowAllowed: boolean) {
  return { enabled: true, paymentReady: true, escrowBetaOnly: true, escrowAllowed }
}

describe('电签担保可用性的缓存', () => {
  beforeEach(() => {
    mocks.availability.mockReset()
    mocks.token.value = ''
  })

  it('匿名拿到的「不可用」不算结论：不标记已加载，也不会挡住后面的重问', async () => {
    const mod = await freshModule()
    mocks.availability.mockResolvedValueOnce(availability(false))

    await mod.loadAdapayAvailability()

    expect(mocks.availability).toHaveBeenCalledWith(undefined)
    expect(mod.platformGuaranteeReady.value, '匿名结果不应被当成就绪').toBe(false)
    expect(mod.platformGuaranteeLoaded.value, '匿名结果不应标记为已加载').toBe(false)
  })

  it('登录后再问一次就能纠正：带上令牌重问并缓存「可用」', async () => {
    const mod = await freshModule()
    mocks.availability.mockResolvedValueOnce(availability(false))
    await mod.loadAdapayAvailability()

    mocks.token.value = 'user-token'
    mocks.availability.mockResolvedValueOnce(availability(true))
    await mod.loadAdapayAvailability()

    expect(mocks.availability).toHaveBeenLastCalledWith('user-token')
    expect(mod.platformGuaranteeLoaded.value).toBe(true)
    expect(mod.platformGuaranteeReady.value).toBe(true)
  })

  it('带令牌拿到的结论要缓存：后续调用不再打接口', async () => {
    const mod = await freshModule()
    mocks.token.value = 'user-token'
    mocks.availability.mockResolvedValue(availability(true))

    await mod.loadAdapayAvailability()
    await mod.loadAdapayAvailability()

    expect(mocks.availability).toHaveBeenCalledTimes(1)
    expect(mod.platformGuaranteeReady.value).toBe(true)
  })

  it('force 可以强制重问（弹窗每次打开时用它确认一次）', async () => {
    const mod = await freshModule()
    mocks.token.value = 'user-token'
    mocks.availability.mockResolvedValue(availability(true))
    await mod.loadAdapayAvailability()

    await mod.loadAdapayAvailability(true)

    expect(mocks.availability).toHaveBeenCalledTimes(2)
  })

  it('接口异常按不可用降级，并且不再反复重试', async () => {
    const mod = await freshModule()
    mocks.token.value = 'user-token'
    mocks.availability.mockRejectedValue(new Error('boom'))

    await mod.loadAdapayAvailability()
    await mod.loadAdapayAvailability()

    expect(mod.platformGuaranteeReady.value).toBe(false)
    expect(mod.platformGuaranteeLoaded.value, '异常结果按已知的不可用缓存下来').toBe(true)
    expect(mocks.availability).toHaveBeenCalledTimes(1)
  })
})
