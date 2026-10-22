/**
 * 首页主区的三段静态内容（R047 从 `views/HomeView.vue` 下沉）：主视觉信号词、两张快捷卡、定制流程五步。
 *
 * 这三段是**纯数据**：既不读接口也不随登录态变化，视图只负责把它们传给对应的展示组件
 * （`PortalHeroSection` / `PortalQuickPanels` / `PortalWorkflowSection`）并按交互跳转。
 * 拆成模块是为了让视图守住行数预算，同时让三段内容与「怎么跳」解耦 —— 改文案不用动视图。
 */

/** 主视觉下方的一排信号词（首页唯一用途是渲染，顺序即展示顺序）。 */
export const HOME_HERO_SIGNALS: readonly string[] = ['免费资源共享', '需求记录留痕', '工单沟通协作']

/** 门户首页「免费资源 / 社区交流」两张快捷卡：`tone` 决定图标与配色 class。 */
export type PortalQuickPanel = {
  title: string
  summary: string
  action: string
  tone: 'gift' | 'briefcase'
}

export const HOME_QUICK_PANELS: readonly PortalQuickPanel[] = [
  {
    title: '免费资源',
    summary: 'Minecraft、网站与工具资源\n发现并复用现成的优质内容',
    action: '立即查看',
    tone: 'gift',
  },
  {
    title: '社区交流',
    summary: '社区互动、动态分享与内容交流\n结识同好、展示成果与获取灵感',
    action: '进入社区',
    tone: 'briefcase',
  },
]

/** 定制流程的一步：`action` 决定点击后走哪一支（发布 / 开发者入口 / 需求进度）。 */
export type PortalWorkflowStep = {
  step: string
  title: string
  summary: string
  icon: string
  accent: string
  actionLabel: string
  action: 'publish' | 'progress' | 'developer'
}

export const HOME_WORKFLOW_STEPS: readonly PortalWorkflowStep[] = [
  {
    step: '1',
    title: '提交需求',
    summary: '填写需求与预算',
    icon: '▣',
    accent: 'violet',
    actionLabel: '发布需求',
    action: 'publish',
  },
  {
    step: '2',
    title: '需求审核',
    summary: 'AI+人工复核\n确认需求信息',
    icon: '☑',
    accent: 'blue',
    actionLabel: '查看进度',
    action: 'progress',
  },
  {
    step: '3',
    title: '开发者接单',
    summary: '开发者接单\n开始工作',
    icon: '⊞',
    accent: 'green',
    actionLabel: '开发者入口',
    action: 'developer',
  },
  {
    step: '4',
    title: '完成验收',
    summary: '确认需求',
    icon: '☑',
    accent: 'violet',
    actionLabel: '我的需求',
    action: 'progress',
  },
  {
    step: '5',
    title: '评价完成',
    summary: '交易完成\n双方评价',
    icon: '♥',
    accent: 'red',
    actionLabel: '评价订单',
    action: 'progress',
  },
]
