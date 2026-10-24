import type {
  CreateMcResourceTagSelection,
  UpdateMcResourceHomepageRequest,
} from '@/api/mcResources'
import {
  parsePointsPriceInput,
  parsePromoSharePercentInput,
  parseYuanPriceInput,
} from '@/shared/resourceSale'
import { sanitizeRichHtml } from '@/utils/sanitizeHtml'

/**
 * 「保存资源主页」这一步的纯逻辑：先逐条过校验，再把表单拼成 PATCH 载荷。
 *
 * 抽出来的理由有两个：
 * 1. 校验有 15 道闸，散在 200 行的 `saveHomepage` 里读不出顺序，也没法单独测；
 * 2. 载荷的每个字段都有「空串 / null 语义不同」的讲究（清空封面必须传空串，
 *    `docs_url` 传 null 表示不改），拼装与校验同源才好断言「逐字段正确」。
 *
 * 这里只处理「表单内容本身」，登录态、锁定态、协议未签、渠道格式这类
 * 需要上下文（路由 / 资源 / 渠道配置）的拦截留在调用方。
 */

/** 校验所需的表单快照（全部是值，不带响应式）。 */
export interface HomepageSaveGuard {
  title: string
  description: string
  isApiKind: boolean
  /** 资源归类没能在标签树里定位到（界面上的归类只是展示回落，提交的是资源原有归类）。 */
  keepSavedTags: boolean
  /** 当前二级节点下有几个标签组、勾了几个标签。 */
  platformGroupCount: number
  selectedTagCount: number
  ownershipType: 'individual' | 'team'
  teamId: string
  effectiveOriginType: 'original' | 'repost'
  originUrl: string
  priceYuan: string
  pricePoints: string
  promoSharePercent: number
  /** 设过现金售价的资源不可改为积分售价。 */
  pointsLockedBySavedCash: boolean
  /** 已绑定定制交付的资源不能设为付费售卖。 */
  boundToRequirement: boolean
  copyrightDeclared: boolean
  /** 资源的可见性（review / published 才需要按「付费资源」额外校验）。 */
  visibility: string
}

export interface HomepageSaveCheck {
  /** 第一道没过的提示文案；全都过了是 null。 */
  message: string | null
  /** 校验时顺手算出来的提交口径，省得调用方再解析一遍。 */
  priceFen: number
  pricePoints: number
  promoShareBps: number
}

/** 按顺序过一遍主页保存的校验闸；返回第一条没过的提示。 */
export function checkHomepageSave(guard: HomepageSaveGuard): HomepageSaveCheck {
  const fail = (message: string): HomepageSaveCheck => ({
    message,
    priceFen: 0,
    pricePoints: 0,
    promoShareBps: 0,
  })

  if (!guard.title.trim() || !guard.description.trim()) {
    return fail('请先填写资源标题和资源简介')
  }

  // 接口资源不选标签归类，标签相关的必填项对它不成立；
  // 归类没能在标签树里定位到的资源也跳过：界面上那份是回落展示，
  // 本次提交的是资源原有归类，不该被这里的必填挡住。
  if (
    !guard.isApiKind &&
    !guard.keepSavedTags &&
    (guard.platformGroupCount === 0 || guard.selectedTagCount === 0)
  ) {
    return fail('请至少选择一个标签')
  }

  if (guard.ownershipType === 'team' && !guard.teamId) {
    return fail('请选择所属团队')
  }

  if (guard.effectiveOriginType === 'repost' && !guard.originUrl.trim()) {
    return fail('转载资源必须填写原始出处链接')
  }

  const priceParsed = parseYuanPriceInput(guard.priceYuan)
  if (!priceParsed.ok) {
    return fail(priceParsed.message)
  }
  const pointsParsed = parsePointsPriceInput(guard.pricePoints)
  if (!pointsParsed.ok) {
    return fail(pointsParsed.message)
  }
  if (priceParsed.fen > 0 && pointsParsed.points > 0) {
    return fail('现金售价与积分售价不能同时大于 0')
  }

  const isPublic = guard.visibility === 'review' || guard.visibility === 'published'

  // R028：接口资源只走现金价（积分购是平台内入口，指定地址售卖没有它）
  if (guard.isApiKind) {
    if (pointsParsed.points > 0) {
      return fail('接口资源只能设置现金售价，不能设置积分售价')
    }
    // 已上架（审核中 / 公开展示）的接口资源必须留现金售价，否则开放接口卖不出去
    if (priceParsed.fen <= 0 && isPublic) {
      return fail('接口资源必须填写现金售价（元）')
    }
  }

  // R029：推广分成比例先在前端拦一道（0～50，留空 = 关闭）；清空保存 = 把比例改回 0
  const promoParsed = parsePromoSharePercentInput(guard.promoSharePercent)
  if (!promoParsed.ok) {
    return fail(promoParsed.message)
  }

  if (pointsParsed.points > 0 && guard.pointsLockedBySavedCash) {
    return fail('设过现金售价的资源不可改为积分售价')
  }

  if (guard.boundToRequirement && (priceParsed.fen > 0 || pointsParsed.points > 0)) {
    return fail('已绑定定制交付的资源不能设为付费售卖')
  }

  if ((priceParsed.fen > 0 || pointsParsed.points > 0) && !guard.copyrightDeclared && isPublic) {
    return fail('付费资源须勾选版权声明（拥有或已获合法授权）')
  }

  return {
    message: null,
    priceFen: priceParsed.fen,
    pricePoints: pointsParsed.points,
    promoShareBps: promoParsed.bps,
  }
}

/** 拼装 PATCH 载荷所需的表单快照。 */
export interface HomepagePayloadInput {
  form: {
    title: string
    author: string
    description: string
    cover_url: string
    docs_url: string
    release_note: string
    ownershipType: 'individual' | 'team'
    teamId: string
    originAuthor: string
    originUrl: string
    originOrg: string
    originNote: string
    copyrightDeclared: boolean
  }
  isApiKind: boolean
  effectiveOriginType: 'original' | 'repost'
  /** 归类的提交口径（接口资源为空，回落态下是资源原有归类）。 */
  tagSelections: CreateMcResourceTagSelection[]
  /** 本次要提交的封面地址；有选新文件时是上传后的地址。 */
  coverUrl: string | null
  priceFen: number
  pricePoints: number
  promoShareBps: number
}

/** 表单 → `PATCH /dev/resources/resources/{id}` 的载荷。字段口径见函数内的逐条注释。 */
export function buildHomepagePayload(input: HomepagePayloadInput): UpdateMcResourceHomepageRequest {
  const { form } = input
  return {
    title: form.title.trim(),
    author: form.author.trim(),
    description: form.description.trim(),
    tag_selections: input.tagSelections,
    // cover_url / release_note 传空串表示清空，传 null 后端会当成没改
    cover_url: input.coverUrl,
    docs_url: form.docs_url.trim() || null,
    // 保存时用 sanitizeRichHtml 将 language-md 代码块渲染为富文本
    release_note: sanitizeRichHtml(form.release_note.trim()),
    ownership_type: form.ownershipType,
    team_id: form.ownershipType === 'team' && form.teamId ? Number(form.teamId) : null,
    origin_type: input.effectiveOriginType,
    origin_author: form.originAuthor.trim() || null,
    origin_url: form.originUrl.trim() || null,
    origin_org: form.originOrg.trim() || null,
    origin_note: form.originNote.trim() || null,
    buyout_price_fen: input.priceFen,
    price_points: input.isApiKind ? 0 : input.pricePoints,
    copyright_declared: form.copyrightDeclared,
    // R029：比例整体提交，0 也显式下发——清空回 0 这种操作不能靠省略字段变成静默失效
    promo_share_bps: input.promoShareBps,
  }
}
