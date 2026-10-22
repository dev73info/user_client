/**
 * 合同域接口。
 *
 * 拆成 mine（我的合同列表 / 详情 / 按需求取合同）、signing（签署状态、签署、爱签发起与同步、预览）、
 * requirement（发起合同与自定义附件）、agreements（开发者入驻协议 / 接口使用协议）、
 * download（鉴权下载附件与空白模板）与共用的 types；
 * 本文件只做汇总导出，调用方仍然 `import ... from '@/api/contracts'`。
 *
 * `@/shared/contracts` 的类型与常量照旧从这里透传（原来就在本模块头部再导出）。
 */
export type { ContractSigningStatus } from '@/shared/contracts'
export {
  ATTACHMENT_REVIEW_STATUS,
  CONTRACT_CONTENT_SOURCE,
  attachmentReviewStatusLabel,
  contractContentSourceLabel,
} from '@/shared/contracts'
export type {
  ContractAttachmentParty,
  ContractAttachmentReviewStatus,
  ContractContentSource,
} from '@/shared/contracts'

export type {
  ContractAttachmentFields,
  ContractDetail,
  DownloadedContractFile,
  DraftContractAttachmentPayload,
  MyContractSummary,
  SignContractInitiateResponse,
  SignContractPayload,
  SigningLogItem,
} from './types'

export { fetchMyContract, fetchMyRequirementContract, listMyContracts } from './mine'

export {
  fetchAsignContractPreviewUrl,
  fetchAsignRequirementPreviewUrl,
  fetchContractSigningStatus,
  fetchDevContractSigningStatus,
  initiateAsignSign,
  signContract,
  syncAsignSignStatus,
} from './signing'

export {
  createRequirementContract,
  deleteContractAttachment,
  draftContractAttachment,
  uploadContractAttachment,
} from './requirement'

export { fetchApiUsageAgreement, fetchDeveloperAgreement } from './agreements'

export { downloadBlankContractTemplate, downloadContractAttachment } from './download'
