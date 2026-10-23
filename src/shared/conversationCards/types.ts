import type { RouteLocationRaw } from 'vue-router'

/**
 * 需求会话里的状态变化卡片：后端写入 message_type='card' 的消息，
 * action_type 为事件码，前端在这里统一决定标题、说明、按钮文案与跳转目标。
 * 卡片自己能做的动作（交付、验收、支付定金 / 尾款）都在同一条会话的底部工具条上，
 * 有原地的弹窗就把人交给它，只有真的在别处才能做的事（签约、需求大厅）才跳页。
 */
export type ConversationCardMeta = {
  title: string
  description: string
  /** 动作按钮文案；为空表示这张卡片当前不给按钮（例如定金缴完后需求方已无事可做）。 */
  actionLabel?: string
  /** 站内跳转目标；与 asignPreview 同时给出时，作为爱签预览取不到链接的回退。 */
  to?: RouteLocationRaw
  /** 跳爱签合同预览页（可查看可签署），取不到链接时回退 to。 */
  asignPreview?: boolean
  /** 下载交付产物：按卡片上的版本号取绑定资源项目的交付版本文件，不再走 to 跳转。 */
  downloadDelivery?: boolean
  /**
   * 这张卡片当前还该不该给「交付」入口（开发者视角），点了原地打开交付弹窗，不跳页。
   *
   * 与 `to` 的区别就在这儿：交付弹窗一直挂在会话底部的工具条上，「去交付」把它打开即可，
   * 把人送回需求列表再自己找入口是白跑一趟。能不能交付仍由工具条裁定（没绑资源项目、
   * 阶段不对都不给），卡片只负责把入口摆出来。
   */
  deliveryAction?: boolean
  /**
   * 这张卡片当前还该不该给「验收」入口（需求方视角）。
   *
   * 只说「卡片所在的这一步还是验收那一步」，不看合同、绑定资源与版本数这些实际条件——
   * 那些由会话工具条按需求当前状态裁定，渲染时两者取交集，所以这里放宽也只会少给按钮，
   * 不会给出一个点下去必然报错的入口。
   */
  acceptanceAction?: boolean
  /**
   * 这张卡片当前还该不该给「支付」入口（需求方视角）：定金或尾款按需求当前状态判断，
   * 点了原地打开支付弹窗，不跳页。
   *
   * 与 `to` 的区别同 `deliveryAction`：支付弹窗一直挂在会话底部的工具条上，「支付定金 /
   * 支付尾款」把它打开即可，把人送回需求列表再自己找入口是白跑一趟。能不能付仍由工具条
   * 裁定（自管模式、合同未签、阶段不对都不给），卡片只负责把入口摆出来。
   */
  paymentAction?: boolean
}

export type ConversationCardRole = 'customer' | 'developer'

/** 卡片在会话里靠哪一侧。 */
export type ConversationCardSide = 'mine' | 'other' | 'system'
