<script setup lang="ts">
/**
 * 资金卡：收入（今日收入 + 近 N 天曲线）、提现口径（可提现 / 待提现 / 已提现）与保证金三段。
 * 原先分装在「收入分析」与「资金状态」两张卡里，「待提现」「可提现」各被报了两遍；合并后
 * 同一笔钱全页只出现一次，这条口径现在只剩这一份。
 *
 * 组件只画：读数、曲线与保证金状态胶囊（`depositChip`）由视图传；提现与充值只 `emit` 出去，
 * 弹窗与成功后的回刷仍在视图（`DevWithdrawalDialog` / `DevDepositRechargeDialog`）。
 */
import { computed } from 'vue'
import { TIcon, CircleCheck, Clock, Money, Wallet } from 'ui_73info'

import DevIncomeTrendChart from '@/components/dev/DevIncomeTrendChart.vue'
import type { DevHomeIncomeBucket } from '@/composables/useIncomeChart'
import { money } from '@/shared/devFundDisplay'

const props = defineProps<{
  todayIncome: number | null
  /** 今日到账较昨日的环比，正负只影响符号与颜色；缺值时不显示这一格。 */
  changeRate: number | null
  /** 曲线上横轴的天数（真机近 7 天、全屏看板近 30 天），由数据条数决定。 */
  chartDays: number
  chartCaption: string
  buckets: DevHomeIncomeBucket[]
  /** 本月累计到账：只有全屏看板拿得到按自然月汇总的口径，其余时候为 null（整格不出现）。 */
  monthIncome: number | null
  withdrawable: number
  pendingWithdraw: number
  paidWithdraw: number
  availableDeposit: number | null
  frozenDeposit: number | null
  totalPaidDeposit: number | null
  /** 保证金状态胶囊：拿到接口数据后才出现，避免加载中把「还没读到」显示成「可接单」。 */
  depositChip: { label: string; className: string } | null
}>()

const emit = defineEmits<{
  withdraw: []
  recharge: []
}>()

/** 涨幅正负都只影响颜色与符号，文案口径固定为「较昨日」。 */
const changeRateText = computed(() => {
  const rate = props.changeRate
  if (rate == null || !Number.isFinite(rate)) {
    return ''
  }
  const sign = rate > 0 ? '+' : ''
  return `${sign}${rate.toFixed(1)}%`
})
</script>

<template>
  <section class="dev-surface-card dev-home__panel dev-home__fund">
    <div class="dev-card-head">
      <div class="dev-card-head__title-block">
        <h3 class="dev-section-title">资金概览</h3>
      </div>
    </div>

    <!-- 收入走势与余额两组：桌面上下排，平板档左右并排（见视图样式 641–900 档） -->
    <div class="dev-home__fund-trend">
      <!-- 「今日收入」是这一栏唯一带「今天」口径的读数，环比就跟在它旁边 -->
      <div class="dev-home__income-head">
        <span class="dev-home__income-label">今日收入</span>
        <strong class="dev-figure dev-figure--ink">{{ money(todayIncome) }}</strong>
        <span
          v-if="changeRateText"
          class="dev-home__trend"
          :class="changeRate != null && changeRate < 0 ? 'dev-home__trend--down' : ''"
          :title="'今日到账较昨日的环比'"
        >
          {{ changeRateText }} 较昨日
        </span>
      </div>
      <div class="dev-home__trend-head">
        <p class="dev-home__group-label">近 {{ chartDays }} 天到账</p>
        <!-- 本月累计只在看板上出现：快照才有按自然月汇总的口径 -->
        <p v-if="monthIncome != null" class="dev-home__month">
          <span>本月累计到账</span>
          <strong>{{ money(monthIncome) }}</strong>
        </p>
      </div>

      <!-- 走势图：坐标换算与悬停状态在 useIncomeChart，画在 DevIncomeTrendChart；
           这里只给「取哪几天的数」与图上 title 的口径说明 -->
      <DevIncomeTrendChart :buckets="buckets" :caption="chartCaption" />
    </div>
    <div class="dev-home__fund-balance">
      <!-- 提现口径：大数只报可提现余额，另两笔金额各报一次 -->
      <div class="dev-home__money">
        <div class="dev-home__money-head">
          <span class="dev-home__money-figure">
            <span class="dev-home__money-label">可提现余额</span>
            <strong class="dev-figure">{{ money(withdrawable) }}</strong>
          </span>
          <!-- 提现按钮就贴在余额右侧：这一段的主操作只有一个，不必再排一行页脚。
               点了就地拉起提现弹窗（与收益钱包页共用同一个），不再跳到钱包页。 -->
          <button
            class="dev-btn dev-btn--primary dev-home__money-action"
            type="button"
            @click="emit('withdraw')"
          >
            <TIcon>
              <Wallet />
            </TIcon>
            <span>提现</span>
          </button>
        </div>

        <!-- 两个读数并成一行：提现口径只有这两笔，收入口径的读数已经在上面（今日收入、曲线） -->
        <dl class="dev-home__facts">
          <div class="dev-home__fact">
            <span class="dev-home__fact-icon dev-home__fact-icon--gold" aria-hidden="true">
              <TIcon>
                <Clock />
              </TIcon>
            </span>
            <div class="dev-home__fact-copy">
              <dt>待提现</dt>
              <dd>{{ money(pendingWithdraw) }}</dd>
            </div>
          </div>

          <div class="dev-home__fact">
            <span class="dev-home__fact-icon dev-home__fact-icon--cyan" aria-hidden="true">
              <TIcon>
                <CircleCheck />
              </TIcon>
            </span>
            <div class="dev-home__fact-copy">
              <dt>已提现</dt>
              <dd>{{ money(paidWithdraw) }}</dd>
            </div>
          </div>
        </dl>
      </div>
      <!-- 保证金是这一栏唯一带操作、也是唯一会阻断接单的一段：
           给它浅蓝内嵌底 + 状态胶囊，与上面纯读数的收入、提现两段分开。 -->
      <div class="dev-home__deposit">
        <div class="dev-home__deposit-head">
          <span class="dev-home__money-label">可用保证金</span>
          <span v-if="depositChip" class="dev-chip dev-home__chip" :class="depositChip.className">
            {{ depositChip.label }}
          </span>
        </div>

        <div class="dev-home__deposit-figure">
          <strong class="dev-figure dev-figure--sm dev-figure--ink">{{
            money(availableDeposit)
          }}</strong>
          <button
            class="dev-btn dev-btn--ghost dev-home__deposit-action"
            type="button"
            @click="emit('recharge')"
          >
            <TIcon>
              <Money />
            </TIcon>
            <span>立即充值</span>
          </button>
        </div>
        <p class="dev-home__deposit-meta">
          <span>冻结 {{ money(frozenDeposit) }}</span>
          <span>累计充值 {{ money(totalPaidDeposit) }}</span>
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 静态排布跟着组件走；平板档（641–900）与全屏看板的覆盖留在视图的媒体块里（`:deep()` 只能写在
   「持有子组件的那一层」），断点档位不许在这里另起一套。 */

/* 资金卡：顶部一层很淡的主色渐变，把「看数」这一栏从左侧两张列表卡里拎出来 */
.dev-home__panel.dev-home__fund {
  background:
    radial-gradient(
      120% 60% at 100% 0,
      color-mix(in srgb, var(--dev-blue) 10%, transparent),
      transparent 70%
    ),
    var(--dev-surface-strong);
}

/* 卡片内的小节标签：右栏把收入 / 提现 / 保证金并成一张卡后，用它给各段起头 */
.dev-home__group-label {
  margin: 14px 0 0;
  color: var(--dev-muted);
  font-size: 13px;
}

/* 「近 N 天到账」与「本月累计到账」同一行，标签左、累计右 */
.dev-home__trend-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.dev-home__month {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  margin: 14px 0 0;
  color: var(--dev-muted);
  font-size: 12px;
}

.dev-home__month strong {
  color: var(--dev-gold);
  font-size: 16px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

/* 收入：今日收入大数 + 环比 */
.dev-home__income-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
}

.dev-home__income-label {
  color: var(--dev-muted);
  font-size: 13px;
}

.dev-home__trend {
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dev-cyan) 12%, transparent);
  color: var(--dev-cyan);
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.dev-home__trend--down {
  background: color-mix(in srgb, var(--dev-gold) 12%, transparent);
  color: var(--dev-gold);
}

/* 读数格：两列一行，图标 + 标签 + 数字。合并后只剩提现口径的两个读数 */
.dev-home__facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 14px;
  margin: 14px 0 0;
  padding-top: 14px;
  border-top: 1px solid var(--dev-line);
}

.dev-home__fact {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.dev-home__fact-icon {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: var(--wb-accent-soft);
  color: var(--dev-blue);
  font-size: 16px;
}

.dev-home__fact-icon--gold {
  background: color-mix(in srgb, var(--dev-gold) 14%, transparent);
  color: var(--dev-gold);
}

.dev-home__fact-icon--cyan {
  background: color-mix(in srgb, var(--dev-cyan) 14%, transparent);
  color: var(--dev-cyan);
}

.dev-home__fact-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.dev-home__fact-copy dt {
  color: var(--dev-muted);
  font-size: 12px;
  line-height: 1.3;
}

.dev-home__fact-copy dd {
  margin: 0;
  color: var(--dev-ink);
  font-size: 15px;
  font-weight: 800;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

/* 提现：可提现大数（右侧贴提现按钮）+ 两个口径读数，再往下是保证金。原先那条
   「可提现 / 待提现」比例条与图例只把这两个数换成百分比又说了一遍，已删。 */
.dev-home__money {
  display: grid;
  gap: 12px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--dev-line);
}

.dev-home__money-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px 14px;
}

.dev-home__money-figure {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.dev-home__money-label {
  color: var(--dev-muted);
  font-size: 13px;
}

/* 保证金：三段里唯一带操作、也是唯一会阻断接单的一段。前两段已经各有一条 hairline 起头，
   第三段再来一条只是「又一段」；改用浅蓝内嵌块把它从卡片里拎出来，底色取自主色 --dev-blue。 */
.dev-home__deposit {
  display: grid;
  gap: 10px;
  margin-top: 16px;
  padding: 14px;
  border: 1px solid var(--wb-accent-line);
  border-radius: var(--dev-radius-inner);
  background: var(--wb-accent-soft);
}

/* 首行：标签在左、接单状态在右。状态才用胶囊——.dev-chip 是「浅底 + 深字」的状态形态，
   装金额会与真正的状态标签混作一谈。 */
.dev-home__deposit-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

/* 次行：大数在左、充值按钮同排——与上面「可提现余额 + 提现」同一套排法，窄到摆不下时
   按钮整块落到下一行。 */
.dev-home__deposit-figure {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}

/* 冻结与累计充值并成一行脚注：它们只在充值那一下才需要看，各占一枚胶囊会把这一段撑成三行 */
.dev-home__deposit-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px 6px;
  margin: 0;
  color: var(--dev-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

/* 分隔点由样式给出，模板里少一个纯装饰节点；换行时它会跟着第二个读数一起落行 */
.dev-home__deposit-meta span + span::before {
  content: '·';
  margin-right: 6px;
  color: var(--dev-muted);
}

/* 两个动作按钮只留排布钩子：圆角、高度与配色都在统一层 .dev-btn（见 dev-base.css）。 */
.dev-home__money-action,
.dev-home__deposit-action {
  flex: 0 0 auto;
}

/* 行内标签比 .dev-chip 矮一档，避免把这一段撑高（项目行里有一份同样的规则）。 */
.dev-home__chip {
  flex: 0 0 auto;
  padding: 4px 10px;
}
</style>
