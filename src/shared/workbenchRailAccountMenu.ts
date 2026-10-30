export type WorkbenchRailAccountMenuItem = {
  key: string
  label: string
  to: { name: string }
}

/**
 * 桌面图标栏齿轮弹层里的账户入口。
 *
 * 这里只留「账户本身」的四条：个人账户（`?view=profile`，在组件里单独一条）、账户详情、
 * 已授权应用、工单中心。交易类（需求 / 合同 / 发票 / 已购 / 过户）与资产类（收藏 / 券 /
 * 积分 / 商城 / 权益 / 徽章）已经上图标栏当分组了，不再在这里重复列一遍 —— 同一件事
 * 出现在两处、两个形状，用户要点两次才能确认「这是不是同一页」。
 */
export const workbenchRailAccountMenuItems: WorkbenchRailAccountMenuItem[] = [
  { key: 'account', label: '账户详情', to: { name: 'workbench-account' } },
  { key: 'authorized-apps', label: '已授权应用', to: { name: 'workbench-authorized-apps' } },
  { key: 'tickets', label: '工单中心', to: { name: 'workbench-tickets' } },
]
