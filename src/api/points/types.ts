import type { components } from '@/api/generated/schema'

type Schemas = components['schemas']

export type UserPointsSelf = Schemas['OverviewResponse']
export type UserPerk = Schemas['PerkResponse']
export type UsernameGradientStatus = Schemas['AppearanceResponse']
export type UserPointsLog = Schemas['LogResponse']
export type UserPointsQuery = { page?: number; page_size?: number }
export type PointsProduct = Schemas['ProductResponse']
export type PromoCard = Schemas['PromoCardResponse']
export type ResourcePromoMeta = Schemas['ResourcePromoMetaResponse']
export type PointsRedeemOrder = Schemas['PointsOrderResponse']
export type CheckinStatus = Schemas['CheckinStatusResponse']
export type CheckinResponse = Schemas['CheckinResponse']
export type TransferPointsPayload = Schemas['TransferRequestBody']
export type TransferPointsResponse = Schemas['TransferResponse']
export type PointsTransfer = Schemas['TransferResponse']
export type PointsTransferMeta = Schemas['TransferMetaResponse']
