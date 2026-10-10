import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ContractAttachmentPanel from '@/components/ContractAttachmentPanel.vue'
import type { ContractDetail } from '@/api/contracts'
import type { RequirementItem } from '@/api/requirements'
import { ATTACHMENT_REVIEW_STATUS, CONTRACT_CONTENT_SOURCE, CONTRACT_STATUS } from '@/shared/contracts'

/**
 * R012 自定义合同附件面板：三态展示、金额预校验、当事人与「已发起签署」两类边界。
 *
 * 面板不自己拉合同（上传/拟定/撤回都把后端最新合同 emit 给父页面），所以这里只需 mock
 * `@/api/contracts` 的动作函数；枚举与文案仍用真实实现，避免测试自造一套口径。
 */
const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  draft: vi.fn(),
  remove: vi.fn(),
  download: vi.fn(),
  template: vi.fn(),
  listRequirements: vi.fn(),
  listMyRequirements: vi.fn(),
}))

vi.mock('@/api/contracts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/contracts')>()
  return {
    ...actual,
    uploadContractAttachment: mocks.upload,
    draftContractAttachment: mocks.draft,
    deleteContractAttachment: mocks.remove,
    downloadContractAttachment: mocks.download,
    downloadBlankContractTemplate: mocks.template,
  }
})
vi.mock('@/api/requirements', () => ({ listRequirements: mocks.listRequirements }))
vi.mock('@/api/devRequirements', () => ({ listMyRequirements: mocks.listMyRequirements }))

const SHA = 'a'.repeat(64)

function contractOf(overrides: Partial<ContractDetail> = {}): ContractDetail {
  return {
    id: 1,
    contract_no: 'HT-001',
    title: '网站服务合同',
    content: '平台生成的合同正文',
    content_sha256: 'content-sha',
    status: CONTRACT_STATUS.awaiting,
    party_a_name: '甲方公司',
    party_a_username: 'alice',
    party_a_signed_at: null,
    party_b_name: '乙方工作室',
    party_b_username: 'bob',
    party_b_signed_at: null,
    requirement_id: 'REQ-001',
    created_at: '2026-10-11 10:00:00',
    content_source: CONTRACT_CONTENT_SOURCE.platform,
    attachment_review_status: ATTACHMENT_REVIEW_STATUS.none,
    ...overrides,
  }
}

function uploaded(overrides: Partial<ContractDetail> = {}): ContractDetail {
  return contractOf({
    content_source: CONTRACT_CONTENT_SOURCE.uploaded,
    attachment_file_name: '双方补充条款.docx',
    attachment_file_size: 2048,
    attachment_file_sha256: SHA,
    attachment_prepared_by: 'alice',
    attachment_prepared_party: 'party_a',
    attachment_prepared_at: '2026-10-11 10:05:00',
    attachment_review_status: ATTACHMENT_REVIEW_STATUS.pending,
    ...overrides,
  })
}

async function render(contract: ContractDetail, party: 'party_a' | 'party_b' | null = 'party_a') {
  const wrapper = mount(ContractAttachmentPanel, {
    props: { token: 'test-token', contract, requirementId: 'REQ-001', party },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listRequirements.mockResolvedValue([
    { requirement_id: 'REQ-001', title: '需求标题', budget: 1000, acceptance_criteria: '验收标准X' },
  ] as unknown as RequirementItem[])
  mocks.listMyRequirements.mockResolvedValue([] as unknown as RequirementItem[])
})

describe('attachment panel states', () => {
  it('empty state invites both parties to prepare an attachment', async () => {
    const wrapper = await render(contractOf())
    expect(wrapper.text()).toContain('本合同还没有自定义附件')
    expect(wrapper.text()).toContain('未准备')
    // 平台规则提示必须在场：附件只是条款补充，资金与期限仍按需求单执行。
    expect(wrapper.text()).toContain('唯一被签署的主文件')
    expect(wrapper.text()).toContain('平台审核放行后')
    wrapper.unmount()
  })

  it('pending shows "等待平台审核" and the attachment facts including the byte sha256', async () => {
    const wrapper = await render(uploaded())
    expect(wrapper.text()).toContain('双方补充条款.docx')
    expect(wrapper.text()).toContain('2.0 KB')
    expect(wrapper.text()).toContain('alice')
    expect(wrapper.text()).toContain(SHA)
    expect(wrapper.text()).toContain('已提交，等待平台审核')
    wrapper.unmount()
  })

  it('approved shows "平台已放行，可以发起签署"', async () => {
    const wrapper = await render(
      uploaded({
        attachment_review_status: ATTACHMENT_REVIEW_STATUS.approved,
        attachment_approved_sha256: SHA,
        attachment_reviewed_by: 'admin',
      }),
    )
    expect(wrapper.text()).toContain('平台已放行，可以发起签署')
    wrapper.unmount()
  })

  it('rejected shows the rejection note in full', async () => {
    const wrapper = await render(
      uploaded({
        attachment_review_status: ATTACHMENT_REVIEW_STATUS.rejected,
        attachment_review_note: '金额条款与需求单预算不一致，请修改后重传',
      }),
    )
    expect(wrapper.text()).toContain('平台已驳回')
    expect(wrapper.text()).toContain('金额条款与需求单预算不一致，请修改后重传')
    wrapper.unmount()
  })

  it('labels drafted terms as 页面拟定（方案 B）', async () => {
    const wrapper = await render(
      uploaded({
        content_source: CONTRACT_CONTENT_SOURCE.drafted,
        attachment_file_name: '补充条款.docx',
      }),
    )
    expect(wrapper.text()).toContain('页面拟定条款')
    wrapper.unmount()
  })
})

describe('attachment panel boundaries', () => {
  it('hides the prepare entry from non-parties', async () => {
    const wrapper = await render(contractOf(), null)
    expect(wrapper.text()).toContain('只有该需求的当事人')
    expect(wrapper.find('input[type="file"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('locks the entry once the channel contract exists（已发起签署）', async () => {
    const wrapper = await render(contractOf({ status: CONTRACT_STATUS.signing }))
    expect(wrapper.text()).toContain('已发起签署，不能再更换附件')
    expect(wrapper.find('input[type="file"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('blocks a drafted amount that differs from the requirement budget', async () => {
    const wrapper = await render(contractOf())
    const draftTab = wrapper.findAll('button').find((button) => button.text().includes('页面拟定条款'))
    await draftTab!.trigger('click')
    await flushPromises()

    await wrapper.find('input[type="text"]').setValue('补充条款')
    await wrapper.find('input[type="number"]').setValue(800)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('拟定金额必须等于需求单预算')
    expect(mocks.draft).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('emits the refreshed contract after a successful upload', async () => {
    const updated = uploaded()
    mocks.upload.mockResolvedValue(updated)
    const wrapper = await render(contractOf())

    const file = new File(['合同'], '双方补充条款.docx', { type: 'application/msword' })
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await flushPromises()

    const submit = wrapper.findAll('button').find((button) => button.text().includes('上传为附件'))
    await submit!.trigger('click')
    await flushPromises()

    expect(mocks.upload).toHaveBeenCalledWith('test-token', 'REQ-001', file)
    expect(wrapper.emitted('updated')?.[0]?.[0]).toMatchObject({ id: 1, attachment_file_name: '双方补充条款.docx' })
    expect(wrapper.text()).toContain('附件已提交，等待平台审核')
    wrapper.unmount()
  })
})
