import type { McResourceKind } from '@/api/mcResources'

/**
 * 资源主页编辑表单的形状与初值。
 *
 * 单独抽成一处是因为有三个地方要按同一份字段名对齐：表单本体（composable）、
 * 售价与推广分成的校验（composable）、保存载荷的拼装（shared）。
 * 字段的注释就是口径说明，别在别处再抄一份。
 */
export interface ResourceHomepageFormState {
  title: string
  author: string
  description: string
  cover_url: string
  docs_url: string
  release_note: string
  ownershipType: 'individual' | 'team'
  teamId: string
  originType: 'original' | 'repost'
  originAuthor: string
  originUrl: string
  originOrg: string
  originNote: string
  /** 售价（元，输入框）；提交时转分；与积分售价互斥 */
  priceYuan: string
  /** 积分售价；与现金售价互斥 */
  pricePoints: string
  /** R029 售卖推广分成比例：百分比数值（0～50，0 = 关闭） */
  promoSharePercent: number
  copyrightDeclared: boolean
  /** R028 资源类别：normal = 大厅公开展示；api = 不公开展示，只能指定来源下单 */
  resourceKind: McResourceKind
  /** R028 接口资源渠道配置（选「接口资源」后才展开） */
  apiCallbackUrl: string
  apiCallbackSecret: string
  /** 允许来源：多行文本，一行一个 */
  apiAllowedOrigins: string
  /** 同一真实买家能否重复购买，默认关闭 */
  apiRepeatPurchasable: boolean
}

/** 表单初值（新建与换资源复位都用它）。 */
export function createResourceHomepageFormState(): ResourceHomepageFormState {
  return {
    title: '',
    author: '',
    description: '',
    cover_url: '',
    docs_url: '',
    release_note: '',
    ownershipType: 'individual',
    teamId: '',
    originType: 'original',
    originAuthor: '',
    originUrl: '',
    originOrg: '',
    originNote: '',
    priceYuan: '0',
    pricePoints: '0',
    promoSharePercent: 0,
    copyrightDeclared: false,
    resourceKind: 'normal',
    apiCallbackUrl: '',
    apiCallbackSecret: '',
    apiAllowedOrigins: '',
    apiRepeatPurchasable: false,
  }
}
