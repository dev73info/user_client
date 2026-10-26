/**
 * 两张入口卡的「行」怎么拼：文案、顺序、语气与禁用态（纯函数，不碰响应式）。
 * 为什么不和 `useAccountEntryGroups` 放一个文件：那一层只剩「把各域的值读出来 + 把点击分发给
 * 动作」，而这里的判断与响应式无关；摊在一个 `.ts` 里会顶过 300 行预算。入参一律是普通值，验文案不必挂载视图。
 */
import {
  CollectionTag,
  CreditCard,
  Iphone,
  OfficeBuilding,
  Postcard,
  Promotion,
  RefreshLeft,
  SwitchButton,
  User,
  Warning,
} from 'ui_73info'

import type { AccountEntry, AccountEntryStatus } from './accountEntries'
import type { SettleAccountStage } from '@/shared/settleAccountStage'

/** 实名认证这一组要看的状态：身份域（状态口径 / 文案 / 主体）与核身域（恢复中 / 撤回中）。 */
export type IdentityRowsState = {
  copy: { title: string; desc: string } // 入口主标题与副说明，文案正本在 `useRealnameIdentity`
  statusText: string
  statusTone: AccountEntryStatus['tone']
  pending: boolean // 审核中（含变更审核中）：给一个「继续人脸核身」的入口
  restoring: boolean // 正在找回刷新后丢失的核身链接（入口行转圈）
  canWithdraw: boolean // 可撤回（审核中，或变更已被后端快照）
  changeBacked: boolean // 变更已快照：撤回行文案换成「取消变更，还原原主体」
  withdrawing: boolean
  approved: boolean
  enterprise: boolean // 企业 / 个体工商户主体：决定认证通过后给哪一套维护入口
}

/**
 * 「认证管理」卡片的第一组：实名认证入口 + 认证通过后的维护入口。
 *
 * 认证类型对应的入口集合：
 *   个人：修改手机号、修改个人信息、变更认证类型
 *   企业 / 个体工商户：修改法人、修改手机号、修改企业信息、变更认证类型（+ 印章管理）
 * 2026-10-04 起把原「电子签约账户」那组并进来，避免同一件事分散在两个分组里。
 */
export function buildIdentityEntries(state: IdentityRowsState): AccountEntry[] {
  const entries: AccountEntry[] = [
    {
      key: 'realname',
      title: state.copy.title,
      desc: state.copy.desc,
      icon: Postcard,
      status: { text: `实名认证：${state.statusText}`, tone: state.statusTone },
    },
  ]

  if (state.pending) {
    entries.push({
      key: 'faceid',
      title: '继续人脸核身',
      desc: '扫码完成人脸核验，也可在这里查询核验结果',
      icon: Promotion,
      loading: state.restoring,
    })
  }

  if (state.canWithdraw) {
    entries.push({
      key: 'withdraw',
      title: state.changeBacked ? '取消变更，还原原主体' : '撤回认证',
      desc: '撤回后可重新填写主体信息',
      icon: RefreshLeft,
      danger: true,
      loading: state.withdrawing,
    })
  }

  if (state.approved) {
    if (state.enterprise) {
      entries.push({
        key: 'legalPerson',
        title: '修改法人',
        desc: '变更企业法人姓名与身份证号，需重新核验',
        icon: User,
      })
    }
    entries.push({
      key: 'mobile',
      title: '修改手机号（验证码方式）',
      desc: '接收签署短信的手机号，用短信验证码改绑',
      icon: Iphone,
    })
    entries.push(
      state.enterprise
        ? {
            key: 'company',
            title: '修改企业信息',
            desc: '变更企业名称会自动重新生成印章',
            icon: OfficeBuilding,
          }
        : {
            key: 'personal',
            title: '修改姓名',
            desc: '修正爱签签署侧登记的姓名，需过一次三要素核验',
            icon: User,
          },
    )
    // 印章是企业主体在爱签侧的用章对象（个人主体没有企业印章），
    // 所以只在企业 / 个体工商户主体下出现，放在语义最近的「修改企业信息」之后。
    if (state.enterprise) {
      entries.push({
        key: 'seal',
        title: '印章管理',
        desc: '查看企业电子印章，可在线制作新印章',
        icon: CollectionTag,
      })
    }
    entries.push({
      key: 'changeSubject',
      title: '变更认证类型',
      desc: '个人 / 企业 / 个体工商户之间切换，需重新认证',
      icon: SwitchButton,
    })
  }

  return entries
}

/** 「收款与结算」这一组要看的状态：结算域的四态进度与缺资料清单，另有 `approved` 来自实名域。 */
export type SettleRowsState = {
  stage: SettleAccountStage
  underReview: boolean // 会员还在渠道审核：入口行禁用，点进去也绑不上
  underReviewText: string
  subjectMismatch: boolean // 已绑的卡还挂在旧主体上
  materialMissing: boolean
  materialMissingText: string
  accountWord: string // 「对公账户 / 银行卡」的口径，按实名主体取
  providerError: string // 会员已通过但没绑卡时，渠道给过的拒绝原话
  corporateLocked: boolean
  approved: boolean
  bound: boolean // 已绑卡：只有这时候「注销结算账户」才有意义
}

/** 「收款与结算」整组：结算账户一行，已绑卡时再跟一行破坏性动作（注销）。 */
export function buildSettleEntries(state: SettleRowsState): AccountEntry[] {
  const { stage } = state
  const entries: AccountEntry[] = [
    {
      key: 'settle',
      title: '结算账户',
      desc:
        stage === 'reviewing'
          ? state.underReviewText
          : stage === 'failed'
            ? `渠道已拒绝开通收款账户，点进去看原因并按提示整改`
            : state.subjectMismatch
              ? state.materialMissing
                ? `实名资料缺${state.materialMissingText}，补齐后才能重新绑定收款账户`
                : '实名主体已变更，原银行卡需按新主体重新绑定'
              : stage === 'bound'
                ? '收款银行卡已绑定，可查看或更换'
                : stage === 'ready'
                  ? `认证已完成，绑定${state.accountWord}后即可收取合同款`
                  : state.approved
                    ? state.providerError
                      ? '收款账户开通失败，点进去看渠道给的原因并补齐资料'
                      : '正在自动开通收款账户，稍后刷新查看'
                    : '完成实名认证后会自动开通收款账户',
      icon: CreditCard,
      // 渠道会员还在审核时**不放开入口**：这时候点进去也绑不上，
      // 只会撞渠道的 member_not_exists，徒增一次失败与一次限流。
      locked: state.underReview,
      // 标签按 settleStage 的四态如实写：已绑卡才是「已设置」，会员还在渠道那边写审核中，
      // 会员好了但没绑卡写「待绑卡」（差的是用户那一步），连会员都还没建写「待认证」。
      // 不这么分的话，「未设置」会把「系统还没办完」和「用户还没绑卡」混成一句，
      // 用户不知道自己该等还是该动手。
      // （历史口径：更早是「收款认证：已认证」，读的是渠道会员状态，未绑卡也显示绿色，
      //   会把人误导成「已能收款」，2026-10-04 改回绑卡口径。）
      status:
        stage === 'reviewing'
          ? { text: '收款账户：渠道审核中', tone: 'warning' }
          : stage === 'failed'
            ? {
                text: state.corporateLocked ? '收款账户：渠道审核未通过' : '收款账户：开通被拒',
                tone: 'danger',
              }
            : state.subjectMismatch
              ? { text: '收款账户：待重绑', tone: 'warning' }
              : stage === 'bound'
                ? { text: '结算账户：已设置', tone: 'success' }
                : stage === 'ready'
                  ? { text: '收款账户：待绑卡', tone: 'warning' }
                  : { text: '收款账户：待认证', tone: 'info' },
    },
  ]

  if (state.bound) {
    entries.push({
      key: 'closeSettle',
      title: '注销结算账户',
      desc: '解绑收款银行卡，注销后合同款无法入账',
      icon: Warning,
      danger: true,
    })
  }

  return entries
}

export { buildSecurityGroups } from './accountSecurityRows'
export type { SecurityRowsState } from './accountSecurityRows'
