<script setup lang="ts">
/**
 * 资金卡：收入（今日收入 + 环比 + 近 7 天曲线）、提现口径（可提现 / 待提现 / 已提现）与近期到账。
 *
 * 唯一的数据源是 `GET /api/requirement/wallet/overview`：读数、曲线与到账明细都由视图传进来，
 * 组件只画；提现只 `emit` 出去，弹窗与成功后的回刷仍在视图（`DevWithdrawalDialog`）。
 *
 * 两处口径写在这里，免得下一个人改回去：
 * - 金额为 `null` 表示**还没读到**，显示「—」而不是 `¥0.00`——把「不知道」画成 0 会让人
 *   以为账上真没钱；
 * - `loaded` 为 false（加载失败 / 还没回）时**不画**曲线与到账明细：曲线空盘会显示
 *   「近 7 天没有到账记录」，那是在替后端回答「你这周没收入」。
 */
import { computed } from 'vue'
import { CircleCheck, Clock, TIcon, Wallet } from 'ui_73info'

import DevIncomeTrendChart from '@/components/dev/DevIncomeTrendChart.vue'
import type { DevHomeIncomeBucket } from '@/composables/useIncomeChart'
import { money } from '@/shared/devFundDisplay'
import type { DevHomeIncomeRow } from '@/shared/devHomeDisplay'

const props = defineProps<{
  /** 钱包读数是否已读到：false 时读数显示「—」，曲线与到账明细整块不出现。 */
  loaded: boolean
  todayIncome: number | null
  /** 今日到账较昨日的环比，正负只影响符号与颜色；缺值时不显示这一格。 */
  changeRate: number | null
  /** 曲线上横轴的天数（近 7 天），由数据条数决定。 */
  chartDays: number
  chartCaption: string
  buckets: DevHomeIncomeBucket[]
  withdrawable: number | null
  pendingWithdraw: number | null
  paidWithdraw: number | null
  /** 近期到账：最多 5 行，新的在前（行由视图算）。 */
  incomes: DevHomeIncomeRow[]
}>()

const emit = defineEmits<{
  withdraw: []
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

/** 金额展示：`null` = 还没读到 → 「—」，不能画成 0。 */
function readable(value: number | null): string {
  return value == null ? '—' : money(value)
}
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
        <strong class="dev-figure dev-figure--ink">{{ readable(todayIncome) }}</strong>
        <span
          v-if="changeRateText"
          class="dev-home__trend"
          :class="changeRate != null && changeRate < 0 ? 'dev-home__trend--down' : ''"
          title="今日到账较昨日的环比"
        >
          {{ changeRateText }} 较昨日
        </span>
      </div>

      <!-- 走势图：坐标换算与悬停状态在 useIncomeChart，画在 DevIncomeTrendChart；
           这里只给「取哪几天的数」与图上 title 的口径说明。没读到数据时整块不画。 -->
      <template v-if="loaded">
        <p class="dev-home__group-label">近 {{ chartDays }} 天到账</p>
        <DevIncomeTrendChart :buckets="buckets" :caption="chartCaption" />
      </template>
    </div>

    <div class="dev-home__fund-balance">
      <!-- 提现口径：大数只报可提现余额，另两笔金额各报一次 -->
      <div class="dev-home__money">
        <div class="dev-home__money-head">
          <span class="dev-home__money-figure">
            <span class="dev-home__money-label">可提现余额</span>
            <strong class="dev-figure">{{ readable(withdrawable) }}</strong>
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
              <dd>{{ readable(pendingWithdraw) }}</dd>
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
              <dd>{{ readable(paidWithdraw) }}</dd>
            </div>
          </div>
        </dl>
      </div>

      <!-- 近期到账：一行一笔分账（实收），完整流水在收益钱包页。
           没读到钱包读数时整块不出现，避免「暂无到账」冒充结论。 -->
      <div v-if="loaded" class="dev-home__incomes">
        <p class="dev-home__group-label">近期到账</p>
        <ul v-if="incomes.length" class="dev-home__income-list">
          <li v-for="row in incomes" :key="row.key" class="dev-home__income">
            <div class="dev-home__income-main">
              <strong class="dev-home__income-title">{{ row.title }}</strong>
              <span class="dev-home__income-amount">{{ money(row.amount) }}</span>
            </div>
            <p class="dev-home__income-meta">
              {{ row.requirementId }} · {{ row.customer }} · {{ row.timeText }}
            </p>
          </li>
        </ul>
        <p v-else class="dev-home__income-empty">还没有到账记录</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 静态排布跟着组件走；平板档（641–900）的覆盖留在视图的媒体块里（`:deep()` 只能写在
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

/* 卡片内的小节标签：用它给收入 / 提现 / 到账三段起头 */
.dev-home__group-label {
  margin: 14px 0 0;
  color: var(--dev-muted);
  font-size: 13px;
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

/* 读数格：两列一行，图标 + 标签 + 数字 */
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
  font-weight: 600;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

/* 提现：可提现大数（右侧贴提现按钮）+ 两个口径读数 */
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

/* 近期到账：一行一笔，标题与金额同行、编号与时间在下面一行 */
.dev-home__incomes {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--dev-line);
}

.dev-home__incomes .dev-home__group-label {
  margin-top: 0;
}

.dev-home__income-list {
  display: grid;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.dev-home__income {
  display: grid;
  gap: 2px;
  padding: 8px 0;
  border-bottom: 1px solid var(--dev-line);
}

.dev-home__income:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.dev-home__income-main {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.dev-home__income-title {
  min-width: 0;
  color: var(--dev-ink);
  font-size: 13px;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.dev-home__income-amount {
  flex: 0 0 auto;
  color: var(--dev-gold);
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.dev-home__income-meta,
.dev-home__income-empty {
  margin: 0;
  color: var(--dev-muted);
  font-size: 12px;
  line-height: 1.6;
  font-variant-numeric: tabular-nums;
}

/* 两个动作按钮只留排布钩子：圆角、高度与配色都在统一层 .dev-btn（见 dev-base.css）。 */
.dev-home__money-action {
  flex: 0 0 auto;
}
</style>
