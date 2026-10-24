/**
 * 开发者资源域接口。
 *
 * 拆成 resource（发布 / 列表 / 详情 / 删除 / 主页更新 / 封面上传 / 道具卡）、
 * version（版本发布与增删改）、apiChannel（R028 接口资源的渠道配置）与共用的 types；
 * 本文件只做汇总导出，调用方仍然 `import ... from '@/api/mcResources'`。
 */
export type {
  CreateMcResourceRequest,
  CreateMcResourceTagSelection,
  CreateMcResourceVersionRequest,
  McResourceKind,
  McResourcePayload,
  McResourcePlatform,
  McResourceTagSelectionPayload,
  McResourceVersionPayload,
  McResourceVisibility,
  ResourceApiChannelPayload,
  UpdateMcResourceHomepageRequest,
  UpdateMcResourceVersionRequest,
  UpdateResourceApiChannelRequest,
} from './types'

export {
  applyResourcePromoCard,
  createMcResource,
  deleteMcResource,
  getMcResource,
  listMcResources,
  listTeamResources,
  submitMcResourceReview,
  updateMcResourceHomepage,
  uploadMcResourceCover,
} from './resource'

export {
  createMcResourceVersion,
  deleteMcResourceVersion,
  listMcResourceVersions,
  updateMcResourceVersion,
} from './version'

export { getResourceApiChannel, updateResourceApiChannel } from './apiChannel'
