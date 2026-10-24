/**
 * 争议 / 解除合作域在**列表页**用的两个纯函数。
 *
 * 案件的类型、状态、金额这些读数一律用契约里后端给好的字段
 * （`kind_label` / `status_label` / `claim_amount_fen`），前端不再维护一份状态码到中文的映射：
 * 后端 `CaseStatus::label()` 才是唯一的文案来源，两边各写一份必然会漂。
 *
 * 这里只剩「角标怎么画」与「角标数什么」两件事。
 */

/** 待办角标读数：超过 99 收成 `99+`，与工作台菜单角标同一口径。 */
export function afterSalesBadgeText(count: number): string {
  return count > 99 ? '99+' : String(count)
}

/**
 * 每条需求上的**在办案件数**：一次 `GET /api/dispute/cases` 就能拿到我参与的全部案件，
 * 不必逐条需求发请求。
 *
 * 只数 `open`（后端 `CaseStatus::is_open`）且已有对方当事人的案件——**不声称「在等我表态」**：
 * `CaseSummaryResponse` 里没有「轮到谁」这个读数（那是 `BreachCaseItemResponse.turn` 才有的），
 * 靠 `filed_by` / `respondent` 自己推算等于另造一套状态机，所以角标只表达「这条需求有争议在办」。
 */
export function countOpenCasesByRequirement(
  cases: ReadonlyArray<{ requirement_id: string; open: boolean; respondent?: string | null }>,
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const item of cases) {
    if (item.open && item.respondent) {
      counts[item.requirement_id] = (counts[item.requirement_id] ?? 0) + 1
    }
  }
  return counts
}
