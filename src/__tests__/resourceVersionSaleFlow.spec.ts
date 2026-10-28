import { nextTick, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { McResourcePayload } from '@/api/mcResources'
import { useResourceVersionSaleFlow } from '@/composables/useResourceVersionSaleFlow'

const mocks = vi.hoisted(() => ({
  route: { query: {} as Record<string, unknown> },
  replace: vi.fn(),
  submitReview: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ replace: mocks.replace }),
}))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ token: 'test-token' }) }))
vi.mock('@/api/mcResources', () => ({ submitMcResourceReview: mocks.submitReview }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.route = reactive({ query: { sale: 'version', create: '1', review: '1' } })
  mocks.replace.mockImplementation(({ query }: { query: Record<string, unknown> }) => {
    mocks.route.query = query
    return Promise.resolve()
  })
  mocks.submitReview.mockResolvedValue({ id: 33, visibility: 'review' })
})

describe('useResourceVersionSaleFlow', () => {
  it('资源加载后只自动开窗一次并消费 create', async () => {
    const resource = ref<McResourcePayload | null>(null)
    const open = vi.fn()
    useResourceVersionSaleFlow({ resource, openCreateVersionDialog: open })

    resource.value = { id: 33 } as McResourcePayload
    await nextTick()
    await nextTick()

    expect(open).toHaveBeenCalledTimes(1)
    expect(mocks.route.query).toEqual({ sale: 'version', review: '1' })
  })

  it('首版后先送审，再清理流程查询参数', async () => {
    const resource = ref({ id: 33 } as McResourcePayload)
    const flow = useResourceVersionSaleFlow({ resource, openCreateVersionDialog: vi.fn() })
    await flow.completeVersionSale()

    expect(mocks.submitReview).toHaveBeenCalledWith('test-token', 33)
    expect(mocks.route.query).toEqual({})
    expect(flow.reviewError.value).toBe('')
  })

  it('送审失败保留流程并可重试，不触发再次开窗', async () => {
    const resource = ref({ id: 33 } as McResourcePayload)
    const open = vi.fn()
    const flow = useResourceVersionSaleFlow({ resource, openCreateVersionDialog: open })
    mocks.submitReview.mockRejectedValueOnce(new Error('审核暂不可用'))

    await flow.completeVersionSale()
    expect(flow.reviewError.value).toContain('首版已发布，公开申请未完成')
    expect(mocks.route.query).toEqual({ sale: 'version', create: '1', review: '1' })

    await flow.completeVersionSale()
    expect(mocks.submitReview).toHaveBeenCalledTimes(2)
    expect(flow.reviewError.value).toBe('')
    expect(open).not.toHaveBeenCalled()
  })
})
