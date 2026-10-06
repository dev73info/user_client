import { describe, expect, it } from 'vitest'
import { conversationCardMeta, conversationCardSide } from '@/shared/conversationCards'

const meta = (
  actionType: string,
  role: 'customer' | 'developer',
  requirementStatus: string | null,
) => conversationCardMeta(actionType, 'REQ-1', role, requirementStatus)

describe('conversation status cards', () => {
  it('offers signing through asign with the in-app page as fallback', () => {
    const card = meta('contract_party_b_signed', 'customer', 'pending_deposit')
    expect(card?.actionLabel).toBe('查看合同')
    expect(card?.asignPreview).toBe(true)
    expect(card?.to).toEqual({
      name: 'contract-sign',
      query: { requirement_id: 'REQ-1', from: 'user' },
    })
  })

  it('drops the deposit button once the deposit is paid', () => {
    const card = meta('contract_signed', 'customer', 'pending_deposit')
    expect(card?.actionLabel).toBe('支付定金')
    // 「支付定金」不跳页：支付弹窗就挂在同一条会话底部的工具条上，按下去原地打开它。
    expect(card?.paymentAction).toBe(true)
    expect(card?.to).toBeUndefined()
    expect(meta('contract_signed', 'customer', 'deposit_paid')?.actionLabel).toBeUndefined()
    expect(meta('contract_signed', 'customer', 'in_development')?.actionLabel).toBeUndefined()
    expect(meta('contract_signed', 'customer', 'deposit_paid')?.paymentAction).toBe(false)
    // 定金那一步做完了就不给：到了待付尾款该付的是尾款，「支付定金」再出现只会付错款。
    expect(meta('contract_signed', 'customer', 'pending_final')?.paymentAction).toBe(false)
    // 开发者在合同签署完成 / 验收通过这两步都没有可做的动作，卡片只作通知。
    expect(meta('contract_signed', 'developer', 'in_development')?.actionLabel).toBeUndefined()
    expect(meta('acceptance_passed', 'developer', 'pending_final')?.actionLabel).toBeUndefined()
    expect(meta('acceptance_passed', 'developer', 'pending_final')?.paymentAction).toBe(false)
    expect(meta('acceptance_passed', 'customer', 'pending_final')?.actionLabel).toBe('支付尾款')
  })

  it('opens the delivery dialog in place instead of sending the developer to the list', () => {
    const card = meta('deposit_paid', 'developer', 'in_development')
    expect(card?.actionLabel).toBe('去交付')
    // 「去交付」不跳页：交付弹窗就挂在同一条会话底部的工具条上，按下去原地打开它。
    expect(card?.deliveryAction).toBe(true)
    expect(card?.to).toBeUndefined()

    expect(meta('deposit_paid', 'customer', 'in_development')?.actionLabel).toBeUndefined()
    expect(meta('deposit_paid', 'customer', 'in_development')?.deliveryAction).toBe(false)
    // 交付入口只在需求卡片上真的有「提交交付版本」的阶段给：待开发时资源或合同还没就绪，
    // 待分账与结单后交付早已做完，这两种情况下再挂「去交付」都只能点出一个空弹窗。
    expect(meta('deposit_paid', 'developer', 'deposit_paid')?.actionLabel).toBeUndefined()
    expect(meta('deposit_paid', 'developer', 'pending_settlement')?.deliveryAction).toBe(false)
    expect(meta('deposit_paid', 'developer', 'completed')?.deliveryAction).toBe(false)
  })

  it('turns the delivered version card into a download for the customer', () => {
    const customer = meta('delivery_submitted', 'customer', 'in_development')
    expect(customer?.actionLabel).toBe('下载交付产物')
    expect(customer?.downloadDelivery).toBe(true)
    expect(customer?.title).toBe('收到交付版本')

    // 交付是开发者自己提交的，这张卡片对开发者只是回执：文案要按开发者视角写，
    // 「收到交付版本」在乙方眼里会像是别人交给了他；按钮也不给。
    const developer = meta('delivery_submitted', 'developer', 'in_development')
    expect(developer?.title).toBe('已提交交付版本')
    expect(developer?.description).toContain('你已提交')
    expect(developer?.actionLabel).toBeUndefined()
    expect(developer?.downloadDelivery).toBe(false)
  })

  it('keeps the acceptance entry on the delivered version card while the step is still open', () => {
    const card = meta('delivery_submitted', 'customer', 'in_development')
    expect(card?.acceptanceAction).toBe(true)
    // 下载入口与验收入口互不影响：产物一直能下，验收入口按阶段出现或消失。
    expect(card?.downloadDelivery).toBe(true)

    // 到了待付尾款这一步，验收入口仍然保留：此时打回会把需求退回「开发中」并挡住宿尾款，
    // 正是「尾款阶段才发现交付问题」的唯一轻出口（付尾款入口在工具条与 acceptance_passed 卡片上）。
    expect(meta('delivery_submitted', 'customer', 'pending_final')?.acceptanceAction).toBe(true)
    // 更靠后（待分账 / 结单）的历史卡片不挂，下载入口则保留。
    expect(meta('delivery_submitted', 'customer', 'pending_settlement')?.acceptanceAction).toBe(false)
    expect(meta('delivery_submitted', 'customer', 'completed')?.acceptanceAction).toBe(false)
    expect(meta('delivery_submitted', 'customer', 'deposit_paid')?.acceptanceAction).toBe(false)
    // 交付是开发者自己提交的，这张卡片对开发者只是通知。
    expect(meta('delivery_submitted', 'developer', 'in_development')?.acceptanceAction).toBe(false)
  })

  it('treats the post-completion delivery card as a notification with the after-sales exit', () => {
    // 结单（completed）后发布版本（售后返工）：验收动作在后端一律被拒，这张卡片不能再走
    // 「等待验收」那套——不给验收入口，文案写明需求已结单并把出口指向售后。
    const customer = meta('delivery_submitted_after_completed', 'customer', 'completed')
    expect(customer).not.toBeNull()
    // 不给验收入口：结单后后端 `accept_delivery` 一律 409，摆出来就是一个必然报错的按钮。
    expect(customer?.acceptanceAction).toBeUndefined()
    expect(customer?.description).toContain('售后')
    // 产物下载保留：版本确实发布了，这是这张卡片上唯一真实可做的动作。
    expect(customer?.actionLabel).toBe('下载交付产物')
    expect(customer?.downloadDelivery).toBe(true)

    const developer = meta('delivery_submitted_after_completed', 'developer', 'completed')
    expect(developer?.title).toContain('已提交')
    expect(developer?.actionLabel).toBeUndefined()
    expect(developer?.downloadDelivery).toBe(false)
  })

  it('treats the paid-but-unsettled card as a notification without a dead-end list jump', () => {
    // 尾款缴清只是进入「待分账」，还要等渠道分账，双方在这段时间都没有可执行的动作。
    expect(meta('final_paid', 'customer', 'pending_settlement')?.actionLabel).toBeUndefined()
    expect(meta('final_paid', 'developer', 'pending_settlement')?.actionLabel).toBeUndefined()
    expect(meta('final_paid', 'customer', 'pending_settlement')?.description).toContain('分账')
  })

  it('treats the settled card as a notification pointing at the after-sales entry', () => {
    const card = meta('requirement_settled', 'customer', 'completed')
    expect(card?.title).toBe('需求已结单')
    expect(card?.description).toContain('售后')
    // 售后入口就在需求卡片上，再给按钮只是空跳转回自己已经在的列表。
    expect(card?.actionLabel).toBeUndefined()
    expect(meta('requirement_settled', 'developer', 'completed')?.actionLabel).toBeUndefined()
  })

  it('sends the developer back to delivery after a rejected acceptance', () => {
    // 需求方验收不通过后，整改与重新交付是开发者的动作，同样是原地打开交付弹窗不跳页。
    const card = meta('acceptance_rejected', 'developer', 'in_development')
    expect(card?.actionLabel).toBe('去交付')
    expect(card?.deliveryAction).toBe(true)
    expect(card?.to).toBeUndefined()
    expect(meta('acceptance_rejected', 'customer', 'in_development')?.actionLabel).toBeUndefined()
    // 与「定金已缴纳」同口径：交付这一步做完之后，历史卡片不再挂「去交付」。
    expect(meta('acceptance_rejected', 'developer', 'pending_settlement')?.actionLabel).toBeUndefined()
    expect(meta('acceptance_rejected', 'developer', 'completed')?.actionLabel).toBeUndefined()
  })

  it('drops the final-payment button once the final payment is paid', () => {
    // 尾款还在等需求方缴时才给入口，且按下去原地打开支付弹窗，不跳页。
    const card = meta('acceptance_passed', 'customer', 'pending_final')
    expect(card?.actionLabel).toBe('支付尾款')
    expect(card?.paymentAction).toBe(true)
    expect(card?.to).toBeUndefined()
    // 缴清即转「待分账」，之后结单——这两步需求方都没有尾款可付，历史卡片上留着按钮
    // 只会把人送回一个已经没有该入口的需求列表。
    expect(meta('acceptance_passed', 'customer', 'pending_settlement')?.actionLabel).toBeUndefined()
    expect(meta('acceptance_passed', 'customer', 'completed')?.actionLabel).toBeUndefined()
    expect(meta('acceptance_passed', 'customer', 'pending_settlement')?.paymentAction).toBe(false)
    expect(meta('acceptance_passed', 'customer', 'completed')?.paymentAction).toBe(false)
    // 需求状态还没取到时按「不在待付尾款」处理：宁可不给按钮，也不给一个可能重复支付的入口。
    expect(meta('acceptance_passed', 'customer', null)?.actionLabel).toBeUndefined()
    expect(meta('acceptance_passed', 'customer', null)?.paymentAction).toBe(false)
  })

  it('ignores unknown event codes', () => {
    expect(meta('whatever', 'customer', 'deposit_paid')).toBeNull()
  })

  it('has copy for every negotiation event code the backend writes', () => {
    // 后端 `system_card_text` 认识的每个事件码都必须在这里有文案：漏一个，会话里那条
    // 卡片就会渲染成空白（界面还承诺过「对方会在会话里收到通知」）。
    const codes = [
      // 结单后发布版本（售后返工）：文案已由后端给出，前端也必须认这个码，
      // 否则它会退化成一条普通消息，卡片语义（结单 / 售后出口）就丢了。
      'delivery_submitted_after_completed',
      // 协商解除（担保与自管两种模式共用）
      'unbind_request_submitted',
      'unbind_request_approved',
      'unbind_request_rejected',
      'unbind_request_auto_rejected',
      'unbind_request_expired',
      // 终止合作
      'breach_case_negotiation_proposed',
      'breach_case_negotiation_rejected',
      'breach_case_ai_reviewing',
      // 终止合作「人工处理」那一段：后台滞留提醒与客服人工结案
      'breach_case_manual_required_reminder',
      'breach_case_manual_closed',
      // 售后
      'after_sales_case_opened',
      'after_sales_case_negotiation_proposed',
      'after_sales_case_negotiation_rejected',
      'after_sales_case_agreed',
      'after_sales_case_rework_accepted',
      'after_sales_case_rework_unfulfilled',
      'after_sales_case_support_reviewing',
      'after_sales_case_funds_processing',
      'after_sales_case_resolved',
      'after_sales_case_rejected',
      'after_sales_case_withdrawn',
      'after_sales_case_manual_required',
      // 售后「人工处理」那一段的后台滞留提醒（BUG-046）
      'after_sales_case_manual_required_reminder',
      // 需求方单方取消（已缴定金档）：与「绑定解除、回到待接单」的结局不同（BUG-050）
      'requirement_cancelled',
      // 违约责任条款（按需判定）：期限届满的四种后果，都要有卡片文案
      'acceptance_deemed_passed',
      'delivery_overdue',
      'final_pay_overdue',
      'remediation_expired',
      // 顺延（不可抗力 / 需求变更 / 第三方原因）：只延期限、不动钱
      'breach_deadline_extended',
    ]
    for (const code of codes) {
      const card = meta(code, 'customer', 'completed')
      expect(card, `事件码 ${code} 缺少卡片文案`).not.toBeNull()
      expect(card?.title.length).toBeGreaterThan(0)
      expect(card?.description.length).toBeGreaterThan(0)
    }
  })

  it('labels a manual case without pushing the user into a ticket to chase it', () => {
    // 客服本来就在跟进，卡片再挂「去工单中心催办」是把平台的跟进变成用户的开单，
    // 平添客服工作量：两侧都只留说明，不给按钮也不给跳转。
    // 「仍在人工处理中」与「已由客服人工结案」两张同口径：都是通知，没有可执行入口。
    for (const code of [
      'breach_case_manual_required',
      'breach_case_manual_required_reminder',
      'breach_case_manual_closed',
      'after_sales_case_manual_required',
      'after_sales_case_manual_required_reminder',
      // 需求方单方取消：只说明结局，不给入口（需求已不在大厅里，BUG-050）
      'requirement_cancelled',
    ]) {
      expect(meta(code, 'customer', 'completed')?.actionLabel).toBeUndefined()
      expect(meta(code, 'customer', 'completed')?.to).toBeUndefined()
      expect(meta(code, 'developer', 'completed')?.actionLabel).toBeUndefined()
      expect(meta(code, 'developer', 'completed')?.to).toBeUndefined()
    }
  })

  it('keeps the negotiation progress cards free of dead-end buttons', () => {
    // 案件详情都在需求卡片的弹窗里，这些卡片再给按钮只是空跳转回自己已经在的页面。
    for (const code of [
      'unbind_request_submitted',
      'breach_case_negotiation_proposed',
      'after_sales_case_negotiation_proposed',
      'after_sales_case_support_reviewing',
    ]) {
      expect(meta(code, 'customer', 'completed')?.actionLabel).toBeUndefined()
    }
  })
})

describe('conversation card sides', () => {
  it('puts the card on the side of whoever did the step', () => {
    // 卡片靠哪一侧看发起方：我这一方做的靠右，对方做的靠左——同一张卡片在两个视角互为镜像。
    expect(conversationCardSide('customer', 'customer')).toBe('mine')
    expect(conversationCardSide('customer', 'developer')).toBe('other')
    expect(conversationCardSide('developer', 'developer')).toBe('mine')
    expect(conversationCardSide('developer', 'customer')).toBe('other')
  })

  it('centers platform notices instead of guessing a side', () => {
    // 纯平台通知（结单、客服裁决、超时兜底）没有发起方，居中。
    expect(conversationCardSide(null, 'customer')).toBe('system')
    expect(conversationCardSide(undefined, 'developer')).toBe('system')
    // 查看者身份也认不出时（历史卡片先于换人，双方对不上）同样居中：摆错侧会被读成
    // 「这一步是对方做的」或「是我做的」，比居中更容易误读。
    expect(conversationCardSide('customer', null)).toBe('system')
  })
})
