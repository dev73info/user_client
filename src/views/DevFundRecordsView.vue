/** * 资金明细：开发者自己的**全部资金进出**合成一张表。 * *
四类动作各有各的台账，此前分成「保证金退回」与「收入记录」两段（各自一张表、各一套列）， *
看一遍钱怎么走要来回切：这里按时间倒序拼成一段，用「类型」区分—— * * | 类型 | 数据来源 | 说明 | * |
--- | --- | --- | * | 保证金充值 | `GET /dev/payments/developer-order-deposit/orders` |
已支付的充值单（未支付/失败/关闭的不算钱进来） | * | 保证金提现 | `GET
/dev/payments/developer-order-deposit/withdrawals` | 保证金退回原充值订单的出款单 | * | 收入 |
父级传进来的 `income`（钱包总览的到账凭据） | 每个里程碑分账到账一笔 | * | 收入提现 | `GET
/dev/payments/withdrawals` | 接单收入的提现出款单 | * *
金额一律按**正数**展示、方向靠「类型」区分（与原来的收入记录同一口径），不做正负号—— *
四类混排时符号容易被读成「同一笔钱的加减」，而它们分属两个互不相通的池子（保证金 / 接单收入）。 * *
合并与文案都在 `shared/devFundDisplay.ts`（纯函数，有单测），本文件只留排版。 */
<script setup lang="ts">
import type { DevWalletIncomeItem } from '@/api/devWallet'
import { LIST_PAGE_SIZES } from '@/composables/useClientPagination'
import { useDevFundRecords } from '@/composables/useDevFundRecords'
import {
  KIND_LABELS,
  isInflowKind,
  kindTagTone,
  money,
  type FundRecordKind,
} from '@/shared/devFundDisplay'
import { TOption, TPagination, TSelect, TTable, TTableColumn, TTag } from 'ui_73info'

const props = defineProps<{ income: DevWalletIncomeItem[]; keyword?: string }>()

const { loading, page, pageSize, recordTotal, pagedRecords } = useDevFundRecords(props)
</script>

<template>
  <div class="fund-records" aria-label="资金明细">
    <TTable
      :loading="loading"
      class="dev-table wallet-records__table"
      :data="pagedRecords"
      row-key="key"
      stripe
    >
      <template #empty>
        <p class="dev-empty-state">{{ loading ? '记录加载中' : '暂无资金记录' }}</p>
      </template>
      <TTableColumn label="类型" width="110">
        <template #default="scope">
          <TTag variant="outline" :tone="kindTagTone(scope.row.kind, scope.row.tag)">
            {{ KIND_LABELS[scope.row.kind as FundRecordKind] }}
          </TTag>
        </template>
      </TTableColumn>
      <TTableColumn label="金额" width="140" align="right">
        <template #default="scope">
          <span
            class="dev-withdraw-table__amount"
            :class="{ 'dev-withdraw-table__amount--income': isInflowKind(scope.row.kind) }"
            >{{ money(scope.row.amount) }}</span
          >
        </template>
      </TTableColumn>
      <TTableColumn label="来源 / 收款账户" min-width="240" show-overflow-tooltip>
        <template #default="scope">
          <div class="dev-table__strong">{{ scope.row.detail }}</div>
          <div class="dev-table__sub">{{ scope.row.account }}</div>
        </template>
      </TTableColumn>
      <TTableColumn label="状态" width="120">
        <template #default="scope">
          <TTag variant="outline" :tone="scope.row.tag">{{ scope.row.status }}</TTag>
        </template>
      </TTableColumn>
      <TTableColumn prop="note" label="处理备注" min-width="200" show-overflow-tooltip />
      <TTableColumn prop="reference" label="交易参考号" min-width="180" show-overflow-tooltip />
      <TTableColumn prop="time" label="时间" min-width="180" />
    </TTable>
    <div class="dev-pager">
      <div class="dev-pager__count">
        <TSelect v-model="pageSize" aria-label="资金明细每页条数" class="dev-pager__size">
          <TOption
            v-for="size in LIST_PAGE_SIZES"
            :key="size"
            :label="`${size} 条/页`"
            :value="size"
          />
        </TSelect>
      </div>
      <TPagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="recordTotal"
        :pager-count="5"
        background
        aria-label="资金明细分页"
      />
    </div>
  </div>
</template>

<style scoped>
/* 表格与表尾都走统一层（.dev-table / .dev-pager），本页只保留金额与来源的排版。 */
.fund-records {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.dev-withdraw-table__amount {
  font-weight: 700;
  color: var(--dev-ink);
  font-variant-numeric: tabular-nums;
}

.dev-withdraw-table__amount--income {
  color: var(--dev-cyan);
}
</style>
