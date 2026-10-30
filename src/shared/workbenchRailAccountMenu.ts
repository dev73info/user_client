export type WorkbenchRailAccountMenuItem = {
  key: string
  label: string
  to: { name: string }
}

/** 桌面图标栏齿轮菜单里的账户与资产入口，与移动端侧栏保持同一组目的地。 */
export const workbenchRailAccountMenuItems: WorkbenchRailAccountMenuItem[] = [
  { key: 'account', label: '账户详情', to: { name: 'workbench-account' } },
  { key: 'authorized-apps', label: '已授权应用', to: { name: 'workbench-authorized-apps' } },
  { key: 'tickets', label: '工单中心', to: { name: 'workbench-tickets' } },
  { key: 'signatures', label: '我的合同', to: { name: 'workbench-signatures' } },
  { key: 'invoices', label: '我的发票', to: { name: 'workbench-invoices' } },
  { key: 'favorites', label: '我的收藏', to: { name: 'workbench-favorites' } },
  { key: 'coupons', label: '优惠券中心', to: { name: 'workbench-coupons' } },
  { key: 'points', label: '积分中心', to: { name: 'workbench-points' } },
  { key: 'mall', label: '积分商城', to: { name: 'mall' } },
  { key: 'perks', label: '我的权益', to: { name: 'workbench-perks' } },
  { key: 'badges', label: '勋章与邀请', to: { name: 'workbench-badges' } },
  {
    key: 'resource-purchases',
    label: '我的已购',
    to: { name: 'workbench-resource-purchases' },
  },
  {
    key: 'purchase-transfers',
    label: '过户与转移',
    to: { name: 'workbench-purchase-transfers' },
  },
]
