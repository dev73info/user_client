/**
 * 公开资源接口。
 *
 * 拆成 list（列表与缓存、详情、历史版本）、engagement（评论与点赞）、
 * download（下载与文件名还原）与共用的 types（含接口前缀常量）；
 * 本文件只做汇总导出，调用方仍然 `import ... from '@/api/resources'`。
 */
export {
  getPublicMcResource,
  invalidateResourceListCache,
  listAllPublicMcResources,
  listPublicMcResourceVersions,
  listPublicMcResources,
} from './list'

export {
  createPublicMcResourceComment,
  likePublicMcResource,
  listPublicMcResourceComments,
  unlikePublicMcResource,
} from './engagement'

export {
  downloadPublicMcResourceFile,
  downloadPublicMcResourceVersionFile,
  extractResourceFileNameFromUrl,
  resolveResourceDownloadFileName,
  with73Extension,
} from './download'

export type {
  CreatePublicMcResourceCommentPayload,
  DownloadProgress,
  McResourcePlatform,
  McResourceTagSelectionPayload,
  PublicMcResourceCommentItem,
  PublicMcResourceItem,
  PublicMcResourceLikeState,
  PublicMcResourceVersionItem,
} from './types'
