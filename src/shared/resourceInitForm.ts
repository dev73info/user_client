/**
 * 「发布资源」创建页表单的形状与初值。
 *
 * 与资源主页编辑页的 `ResourceHomepageFormState` 是两份：创建页没有简介 / 页面内容，
 * 简介由归类读数拼出来（见 useResourceInitForm 的 resourceSummary），封面字段叫 `coverUrl`。
 * 字段的注释就是口径说明，别在别处再抄一份。
 */
export interface ResourceInitFormState {
  title: string
  author: string
  /** 图标预览地址（同时喂给 ResourceIconPicker 的 v-model）。 */
  coverUrl: string
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
  /** R028 接口资源渠道配置（进的是接口资源创建页才展开） */
  apiCallbackUrl: string
  apiCallbackSecret: string
  /** 允许来源：多行文本，一行一个 */
  apiAllowedOrigins: string
}

/** 表单初值（页面加载与创建成功后复位都用它）。 */
export function createResourceInitFormState(): ResourceInitFormState {
  return {
    title: '',
    author: '',
    coverUrl: '',
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
    apiCallbackUrl: '',
    apiCallbackSecret: '',
    apiAllowedOrigins: '',
  }
}
