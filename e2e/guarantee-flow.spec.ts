/**
 * 担保模式（`platform_guarantee`）四流端到端用例。
 *
 * 用三个真实浏览器身份跑完全程：
 *   需求方 5173 发布需求 → 平台运营 5174 审核 → 开发者 5175 接单
 *   → 双方在需求会话里互发消息 → 签《需求开发合同》 → 需求方缴定金 → 开发者交付
 *   → 需求方验收 → 缴尾款 → 分账结单 → 需求方申请开票
 *
 * 覆盖四流：合同流（`contract`）、资金流（`adapay_escrow_payment` / `adapay_escrow_settlement`）、
 * 交付流（绑定资源项目的版本）、发票流（`invoice_record`），外加会话消息
 * （`requirement_conversation_message`：双方手发文本 + 平台状态卡片）。
 *
 * 状态机口径以 `RequirementProgressGuide.vue` 与后端 `requirement/service.rs` 为准：
 *   pending_review → pending_deposit → deposit_paid → in_development
 *   → pending_final → pending_settlement → completed
 *
 * ## 三个运行前提（缺一个就由 preflight 直接报出来，不会跑到一半才炸）
 *
 * 1. 后端必须是 `cargo run` 的 **debug** 构建：运营侧免密登录走
 *    `POST /api/auth/admin-auto-login`，该端点要求 `cfg!(debug_assertions)`、
 *    `dev_auto_login = true` 且请求来自回环地址。
 * 2. 三个前端 dev server 必须已经在 Cursor 终端里跑着（5173 / 5174 / 5175）。
 *    `pnpm dev` 是 `env -u NODE_USE_ENV_PROXY vite`，要 POSIX shell，Playwright 的
 *    `webServer` 在原生 Windows 下既跑不起来、也只认得一个实例。
 * 3. 本地要开着支付模拟：`config/local.toml` 的 `simulation_enabled = true` 且
 *    `environment = "test"`。这样在支付页点「支付」即按渠道支付成功推进，无需真实扫码；
 *    落库与状态流转复用线上回调的同一段逻辑。
 *
 * ## 签署这一步为什么默认走接口
 *
 * 担保合同创建后是「签约中 1」——**乙方（开发者）先签，甲方（需求方）后签**。
 * 但 `ContractSignView.vue` 现在只剩一条路：调 `asign-sign` 拿签署链接，然后
 * `window.location.href` 跳到爱签 `prev.asign.cn`。**平台自带的在线签署入口已从 UI 摘除**，
 * 而爱签那条路的短信验证码在本机不可自动化（实测该 app_id 下万能码 `111111`、`123456`
 * 都被拒，短信发往真人手机号，见 `e2e/support/asign-site.ts` 顶部结论）。
 *
 * 所以默认 `E2E_SIGN_MODE=local`：用后端仍然保留的 `POST /api/contract/{id}/sign` 按
 * 「手写签名 + 实名身份」落库。写入的是同一张合同、同两个签署字段、同一套状态流转
 * （「签约中 1」→「已签约 2」），差别只在签名页由谁渲染。
 * 合同入口本身（需求方点「发起合同」）仍然走 UI，没有被跳过。
 *
 * 要验爱签真实签署时用 `E2E_SIGN_MODE=asign`，并且必须**有头**跑，且需要人工在爱签
 * 签署页窗口里填真实短信验证码。
 *
 * ## 运行方式
 *
 * ```powershell
 * cd e:\yl73info\user-client
 * $env:E2E_BROWSER_CHANNEL = 'chrome'   # 用本机已装 Chrome；不设则用 Playwright 自带 Chromium
 * pnpm exec playwright test guarantee-flow
 * ```
 *
 * ## 数据影响
 *
 * 用例会在本地库里留下真实数据：一条需求、一份合同、两条支付单、两条分账记录、
 * 两张发票记录，以及一条需求会话（含双方手发消息与平台写入的状态卡片），
 * 并占用一个私有资源项目（绑定后不可重复绑定）。每次运行生成带时间戳的新需求标题。
 * 定金一旦支付无法回滚。
 *
 * **每次运行还会冻结 50 元开发者接单保证金**（= 需求预算 `BUDGET_CNY`，接单时冻结），
 * 且这笔冻结不会因为需求结单就释放——**售后窗口结束也不会自动释放**
 * （平台已无后台扫描任务；`release_reason = after_sales_window_closed` 现在只有人工入口能触发）。
 * 实测连跑 8 次后，`GET /api/payment/freeze-details` 里 8 条冻结的 `requirement_status`
 * 全是 `completed` 而 `is_active` 仍为 `true`，`total_active_deposit_frozen_cny` 累积到 400 元，
 * 开发者的 `available_cny` 归零；此后 preflight 会直接在 `can_bind_requirement` /
 * `available_cny` 上失败并提示「先补缴或释放保证金」。
 *
 * 补齐方式（第一种不改业务语义，本机推荐）：
 * - 管理员给开发者入账：`POST /api/payment/developer-order-deposit-orders/credit`，
 *   body `{ "username": "dev_flow_03562487", "amount_cny": 200, "note": "..." }`，
 *   令牌用 `POST /api/auth/admin-auto-login`。入账 200 元够再跑 4 次。
 * - 管理员释放单条冻结：`POST /api/payment/freeze-details/{requirement_id}/release`，
 *   只释放本用例自己造的那些需求，别动真实业务的冻结。
 *
 * ## 登录限流：连续重跑会被卡住（踩过的坑）
 *
 * `POST /api/auth/login` 在 handler 层还有一个**按用户名**的限流桶
 * （`auth:login:username`，`limit=8 window_secs=900`，见 `modules/auth/rate_limit.rs`），
 * **8 次 / 15 分钟 / 每个账号**，比全局写限流严得多。
 *
 * 每跑一次这条用例，每个账号要登录 2 次：preflight 用接口换一次令牌，
 * 对应 dev server 上的 SPA 自动登录再换一次（`App.vue` 的 `initializeAuthSession`）。
 * 所以在 15 分钟窗口内连续跑 4 次，第 8 次之后的登录就会被 429 拒绝。
 *
 * 被拒的后果很隐蔽：`loginWithDevelopmentAccount` 只 `console.warn`，页面**静默地没登上**，
 * 用例停在 `actors.ts` 的「等待自动登录超时」上，看不出是限流。
 * 排查时直接看后端日志里的 `rate limit exceeded bucket=auth:login:username`，
 * 它会带 `retry_after_secs`，等这个秒数过去再跑。
 *
 * 另外注意：用 PowerShell / curl 手工调 `/api/auth/login` 探测也会占用同一个桶的额度。
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { expect, test, type APIRequestContext, type Locator } from '@playwright/test'

import { gotoFresh, openAdmin, openClient, openDeveloper, type Actor } from './support/actors'
import {
  applyInvoices,
  findRequirementByTitle,
  getInvoiceSummary,
  getRequirement,
  getRequirementContract,
  getRequirementConversation,
  listMyInvoices,
  sendConversationMessage,
  signContractLocally,
  waitForContractSigned,
  waitForConversationMessage,
  waitForDeliveryVersion,
  waitForRequirement,
  waitForRequirementStatus,
  waitForSettlementSucceeded,
  type RequirementContract,
} from './support/api'
import { signOnAsignSite } from './support/asign-site'
import {
  ADMIN_ORIGIN,
  BUDGET_CNY,
  CLIENT_ACCOUNT,
  CLIENT_ORIGIN,
  DEVELOPER_ACCOUNT,
  DEVELOPER_ORIGIN,
  FLOW_TEST_TIMEOUT_MS,
  REQUIREMENT_ACCEPTANCE,
  REQUIREMENT_DESCRIPTION,
  SETTLEMENT_TIMEOUT_MS,
  SIGN_MODE,
  STEP_TIMEOUT_MS,
  buildRequirementTitle,
  hashUrl,
} from './support/config'
import { runPreflight, type Preflight } from './support/preflight'

/** 需求方「我的需求」的详情是 `?view=<requirement_id>` 打开的侧栏，不是独立路由。 */
function requirementDetailRoute(requirementId: string): string {
  return `/workbench/requirements?view=${encodeURIComponent(requirementId)}`
}

/** 独立签署页（`ContractSignView.vue`）：合同双方都用它，`from` 只影响回跳观感。 */
function contractSignUrl(origin: string, requirementId: string): string {
  return hashUrl(
    origin,
    `/contract-sign?requirement_id=${encodeURIComponent(requirementId)}&from=user`,
  )
}

/**
 * 往富文本编辑器（tiptap）里输入纯文本。
 *
 * 编辑器本体是 `.rich-text-editor__surface`（来自 `editorProps.attributes.class`）。
 * 用 `insertText` 而不是逐字符 `type`：中文逐字符输入会走输入法组合，慢且偶发丢字。
 */
async function typeIntoRichText(container: Locator, text: string) {
  const surface = container.locator('.rich-text-editor__surface').first()
  await expect(surface, '富文本编辑器没有渲染出来').toBeVisible({ timeout: STEP_TIMEOUT_MS })
  await surface.click()
  await surface.page().keyboard.insertText(text)
  await expect(surface).toContainText(text.slice(0, 8))
}

/**
 * 等一条 toast 文案出现（`AppToast` 挂在全局，不在弹窗里）。
 *
 * 这里不用 `expect().toBeVisible()` 而是自己轮询，是为了在超时时把**期间出现过的所有提示**
 * 一并报出来：`AppToast` 只显示几秒，等 60s 超时后再去读 DOM 已经什么都抓不到，
 * 排查时只会看到一句「没有看到预期的提示」，看不出后端到底返回了什么。
 */
async function expectToast(actor: Actor, text: string) {
  const seen: string[] = []
  const deadline = Date.now() + STEP_TIMEOUT_MS
  while (Date.now() < deadline) {
    const visible = await actor.page.locator('.toastMsg').allInnerTexts().catch(() => [])
    for (const item of visible) {
      const trimmed = item.trim()
      if (trimmed && !seen.includes(trimmed)) seen.push(trimmed)
    }
    if (seen.some((item) => item.includes(text))) return
    await actor.page.waitForTimeout(200).catch(() => undefined)
  }
  throw new Error(
    `没有看到预期的提示「${text}」。${STEP_TIMEOUT_MS}ms 内页面上出现过的提示：${JSON.stringify(seen)}`,
  )
}

/**
 * 关掉一个身份，且最多只等 10 秒。
 *
 * 为什么不用裸 `context.close()`：断言失败后它可能一直不返回，把整条用例拖到
 * Playwright 的入口超时（25 分钟）才结束——失败一次要多等二十分钟，
 * 期间还有一个没人管的浏览器进程。这里超时就放弃等待，剩下的交给 worker 退出时清理。
 */
async function closeActorQuietly(actor: Actor | undefined) {
  if (!actor) return
  await Promise.race([
    actor.context.close().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 10_000)),
  ])
}

test.describe('担保模式四流', () => {
  test('发布 → 审核 → 接单 → 会话 → 签署 → 定金 → 交付 → 验收 → 尾款 → 分账结单 → 开票', async ({
    browser,
    request,
  }) => {
    // 全流程跨三个身份、两次外部跳转与一次同步分账，给足整体超时（入口上限在 playwright.config.ts）。
    test.setTimeout(FLOW_TEST_TIMEOUT_MS)

    let client: Actor | undefined
    let developer: Actor | undefined
    let admin: Actor | undefined
    let deliveryDir: string | undefined

    try {
      // ------------------------------------------------------------ 前置探针
      const pre: Preflight = await test.step('前置探针：三个前端与后端就绪、账号资格齐备', () =>
        runPreflight(request),
      )

      const title = buildRequirementTitle()

      // ------------------------------------------------------------ 发布需求
      await test.step('需求方发布担保需求', async () => {
        client = await openClient(browser)
        await client.page.goto(hashUrl(CLIENT_ORIGIN, '/workbench/requirements?modal=publish'))

        const modal = client.page.locator('.publish-modal')
        await expect(modal, '发布需求弹窗没有打开').toBeVisible({ timeout: STEP_TIMEOUT_MS })

        await modal.getByPlaceholder('例如：企业官网改版、小程序开发').fill(title)
        await typeIntoRichText(modal.locator('.publish-rich-field').nth(0), REQUIREMENT_DESCRIPTION)
        await modal.getByPlaceholder('如 2000').fill(String(BUDGET_CNY))
        await typeIntoRichText(modal.locator('.publish-rich-field').nth(1), REQUIREMENT_ACCEPTANCE)

        // 「电签担保」就是 platform_guarantee；另一个选项是「无电签约定」（self_managed）。
        await modal.getByRole('button', { name: /电签担保/ }).click()
        await modal.getByRole('button', { name: /确认发布/ }).click()

        await expectToast(client, '需求已发布，等待审核')
      })

      const requirementId = await test.step('核对需求已进入待审核', async () => {
        const created = await findRequirementByTitle(request, pre.client, title)
        expect(created.status, '新发布的需求应当处于待审核').toBe('pending_review')
        expect(created.payment_mode, '必须是担保模式').toBe('platform_guarantee')
        return created.requirement_id
      })

      // ------------------------------------------------------------ 平台审核
      await test.step('平台运营审核通过', async () => {
        admin = await openAdmin(browser)
        await admin.page.goto(
          hashUrl(ADMIN_ORIGIN, `/console/review/${encodeURIComponent(requirementId)}`),
        )

        const approve = admin.page.getByRole('button', { name: /审核通过/ })
        await expect(approve, '审核详情页没有渲染出「审核通过」按钮').toBeEnabled({
          timeout: STEP_TIMEOUT_MS,
        })
        await approve.click()

        await waitForRequirementStatus(request, pre.client, requirementId, 'pending_deposit')
      })

      // ------------------------------------------------------------ 开发者接单
      await test.step('开发者在需求大厅接单', async () => {
        developer = await openDeveloper(browser)
        await developer.page.goto(
          hashUrl(DEVELOPER_ORIGIN, '/workbench/developer/requirements/hall'),
        )

        const search = developer.page.getByPlaceholder('搜索需求编号、标题或描述')
        await expect(search, '需求大厅没有渲染出搜索框').toBeVisible({ timeout: STEP_TIMEOUT_MS })
        await search.fill(title)
        await search.press('Enter')

        await expect(
          developer.page.getByText(title).first(),
          '大厅里搜不到刚发布的需求',
        ).toBeVisible({ timeout: STEP_TIMEOUT_MS })

        // 大厅的「接单」不是弹窗：`openBindDialog` 里直接 `router.push` 到接取详情页，
        // 绑定表单是那一页 aside 里的内联卡片 `.dev-requirement-detail__binding-card`。
        await developer.page.getByRole('button', { name: '接单', exact: true }).first().click()

        const bindingCard = developer.page.locator('.dev-requirement-detail__binding-card')
        await expect(bindingCard, '「接单」没有跳到接取需求详情页').toBeVisible({
          timeout: STEP_TIMEOUT_MS,
        })

        // 卡片顶部的金色提示条是阻塞原因（未签协议 / 保证金不足 / 预算超信用上限）。
        // 它一出现，「确认关联」会永远不可点，所以直接把原因抛出来，别让用例干等到超时。
        const blocked = bindingCard.locator('.dev-notice')
        if (await blocked.count()) {
          throw new Error(`接取需求被拦下：${(await blocked.innerText()).trim()}`)
        }

        // 默认就是「关联已有资源项目」（`bindingMode = 'existing'`）。选中第一个可用资源后，
        // 二次确认面板（`.dev-requirement-hall__confirm-panel`）才渲染出来。
        await bindingCard.locator('.el-select').first().click()
        await developer.page.locator('.el-select-dropdown__item:visible').first().click()

        // Element Plus 把原生 input 藏成不可见了：`getByRole('checkbox').check()` 会一直
        // 等「element to be visible」直到超时。要点那颗可见的 label（`<label class="el-checkbox">`
        // 包着 input，原生 label 行为会把 input 切过去），再用 `toBeChecked()` 复核状态。
        const reviewBox = bindingCard
          .locator('.el-checkbox')
          .filter({ hasText: '我已详细阅读需求标题' })
        await reviewBox.click()
        await expect(reviewBox.locator('input.el-checkbox__original')).toBeChecked()

        await expect(
          bindingCard.locator('.dev-requirement-hall__confirm-panel'),
          '选中资源后没有出现二次确认面板',
        ).toBeVisible({ timeout: STEP_TIMEOUT_MS })

        const finalBox = bindingCard
          .locator('.el-checkbox')
          .filter({ hasText: '我确认本次关联无误' })
        await finalBox.click()
        await expect(finalBox.locator('input.el-checkbox__original')).toBeChecked()

        await bindingCard.getByRole('button', { name: /确认关联/ }).click()

        await waitForRequirement(
          request,
          pre.client,
          requirementId,
          (item) => Boolean(item.developer),
          '绑定到开发者',
        )
      })

      // ------------------------------------------------------------ 会话消息
      await test.step('需求方与开发者在需求会话里互发消息', async () => {
        // 会话在接单时建立，参与方就是需求方与开发者（接单前开发者不是参与方，取不到会话）。
        let conversationId = ''
        await expect
          .poll(
            async () => {
              const detail = await getRequirementConversation(
                request,
                pre.client,
                requirementId,
              ).catch(() => null)
              conversationId = detail?.conversation.conversation_id ?? ''
              return conversationId
            },
            { message: '接单之后没有建立需求会话', timeout: STEP_TIMEOUT_MS },
          )
          .toBeTruthy()

        const clientText = `E2E 需求方消息 ${Date.now()}`
        await sendConversationMessage(request, pre.client, conversationId, clientText)

        // 换成开发者身份独立复核：能看到同一条消息，且发送方身份区分得开。
        const { message: seenByDeveloper } = await waitForConversationMessage(
          request,
          pre.developer,
          requirementId,
          (item) => item.content === clientText,
          '需求方发出的消息',
        )
        expect(seenByDeveloper.sender_role, '需求方消息的 sender_role').toBe('customer')
        expect(seenByDeveloper.sender, '需求方消息的 sender').toBe(CLIENT_ACCOUNT.username)
        expect(seenByDeveloper.message_type, '双方手发的是文本消息').toBe('text')

        const developerText = `E2E 开发者消息 ${Date.now()}`
        const afterReply = await sendConversationMessage(
          request,
          pre.developer,
          conversationId,
          developerText,
        )
        const reply = afterReply.messages.find((item) => item.content === developerText)
        expect(reply, '开发者回复应当出现在发送接口返回的会话详情里').toBeTruthy()
        expect(reply?.sender_role, '开发者消息的 sender_role').toBe('developer')
        expect(reply?.sender, '开发者消息的 sender').toBe(DEVELOPER_ACCOUNT.username)

        // 再回需求方侧核一次，确认两个身份看到的是同一条会话。
        const seenByClient = await waitForConversationMessage(
          request,
          pre.client,
          requirementId,
          (item) => item.content === developerText,
          '开发者回复的消息',
        )
        expect(
          seenByClient.detail.conversation.conversation_id,
          '两个身份看到的应当是同一条会话',
        ).toBe(conversationId)
      })

      // ------------------------------------------------------------ 发起合同
      await test.step('需求方发起《需求开发合同》', async () => {
        // 「发起合同」是需求行的唯一主操作（`.requirement-actions__list .action-primary`），
        // 不在 `?view=` 拉起的详情面板里——详情面板只有支付 / 验收 / 售后 / 关闭。
        // 必须整页重载：只改 hash 的跳转不会重新挂载页面，列表会停在上一次的数据上，
        // 那一版数据里这条需求还是「待审核」，行内没有「发起合同」。
        await gotoFresh(client!, CLIENT_ORIGIN, CLIENT_ACCOUNT.username, '/workbench/requirements')

        const requirementRow = client!.page.locator('.requirement-row').filter({ hasText: title })
        await expect(requirementRow, '我的需求列表里找不到本条需求').toBeVisible({
          timeout: STEP_TIMEOUT_MS,
        })

        const createContract = requirementRow
          .locator('.requirement-actions__list')
          .getByRole('button', { name: '发起合同' })
        await expect(createContract, '需求行里没有「发起合同」入口').toBeEnabled({
          timeout: STEP_TIMEOUT_MS,
        })
        await createContract.click()

        // 担保合同发起后即「签约中 1」：乙方（开发者）先签。
        const contract = await waitForRequirementContract(
          request,
          pre.client,
          requirementId,
          1,
        )
        expect(contract.contract_no, '合同应当有合同编号').toBeTruthy()
      })

      // ------------------------------------------------------------ 双方签署
      await test.step(`双方签署合同（模式 ${SIGN_MODE}）`, async () => {
        const contract = await getRequirementContract(request, pre.client, requirementId)

        if (SIGN_MODE === 'local') {
          // 顺序不能颠倒：`sign_contract_by_user` 只放行「签约中 1」的合同，
          // 且需求开发合同里甲方还要等 `party_b_signed_at` 落库才放行（乙方先签、甲方后签）。
          await signContractLocally(request, pre.developer, contract.id)
          await signContractLocally(request, pre.client, contract.id)
        } else {
          await signOnAsignSiteHeaded(developer!, requirementId, 'developer')
          await signOnAsignSiteHeaded(client!, requirementId, 'client')
        }

        const signed = await waitForContractSigned(request, pre.client, requirementId)
        // `signing-status` 只回三个布尔位，没有 `status` 字段（`status` 是合同对象上的字段，
        // 见末尾那次 `getRequirementContract`），所以这里只能断言两个签署位。
        expect(
          signed.party_a_signed && signed.party_b_signed,
          '双方签完后合同应当双方都已签署',
        ).toBeTruthy()
      })

      // ------------------------------------------------------------ 缴定金
      await test.step('需求方支付定金（本地模拟渠道，点支付即成功）', async () => {
        await payMilestone(client!, requirementId, '定金')
        // 合同已签 + 定金到账 → 后端在同一次回调处理里把需求推进到开发中。
        await waitForRequirementStatus(request, pre.client, requirementId, 'in_development', 90_000)
      })

      // ------------------------------------------------------------ 开发者交付
      await test.step('开发者提交交付版本', async () => {
        deliveryDir = await mkdtemp(path.join(os.tmpdir(), 'e2e-delivery-'))
        const artifact = path.join(deliveryDir, `delivery-${Date.now()}.txt`)
        await writeFile(artifact, `担保四流 e2e 交付物：${requirementId}\n`, 'utf8')

        // 必须整页重载：接单成功时「接取需求详情页」自己 `router.push` 到了这一页
        // （`DevRequirementDetailView.vue` 里绑定成功后 `router.push({ name: 'dev-my-requirements' })`），
        // 所以这里再 `goto` 同一路由只是同一文档内的跳转，组件不会重新挂载，
        // 列表会停在上一次那份数据上——那一版里这条需求还是「待缴定金」，
        // `canSubmitDeliveryVersion` 为假，卡片里根本没有「提交交付版本」，断言只会干等到超时。
        await gotoFresh(
          developer!,
          DEVELOPER_ORIGIN,
          DEVELOPER_ACCOUNT.username,
          '/workbench/developer/requirements/my',
        )

        const card = developer!.page.locator('.dev-requirement-card').filter({ hasText: title })
        await expect(card, '我的需求单里找不到本条需求').toBeVisible({ timeout: STEP_TIMEOUT_MS })

        const deliver = card.getByRole('button', { name: '提交交付版本' })
        await expect(deliver, '当前状态不提供「提交交付版本」入口').toBeEnabled({
          timeout: STEP_TIMEOUT_MS,
        })
        await deliver.click()

        const dialog = developer!.page.locator('.el-dialog').filter({ hasText: '提交交付版本' })
        await expect(dialog, '交付弹窗没有打开').toBeVisible({ timeout: STEP_TIMEOUT_MS })
        await dialog.getByPlaceholder('例如：1.0.0、首版功能交付').fill(`e2e-${Date.now()}`)
        await dialog.locator('.delivery-artifact-field__native').setInputFiles(artifact)
        await dialog.getByRole('button', { name: /提交交付版本/ }).click()

        await expectToast(developer!, '等待客户验收')

        // 再核一次库：交付 = 给绑定资源项目发新版本，`bound_resource_version_count` 要加一。
        const delivered = await waitForDeliveryVersion(request, pre.developer, requirementId)
        expect(delivered.bound_resource_id, '交付后需求应当绑定着资源项目').toBeTruthy()

        // 交付本身不推状态：`in_development → pending_final` 是**验收通过**那一步做的
        // （见 `accept_delivery`，只有 `result == "passed"` 且当前是 `in_development` 才推进）。
        // 这里确认需求仍在开发中，正是需求方「验收」入口的前置条件。
        const afterDelivery = await getRequirement(request, pre.client, requirementId)
        expect(afterDelivery.status, '交付阶段需求应当仍在开发中').toBe('in_development')
      })

      // ------------------------------------------------------------ 验收
      await test.step('需求方验收通过', async () => {
        await gotoFresh(
          client!,
          CLIENT_ORIGIN,
          CLIENT_ACCOUNT.username,
          requirementDetailRoute(requirementId),
        )

        const detail = client!.page.locator('.my-requirement-detail')
        const openAcceptance = detail
          .locator('.my-requirement-detail__actions')
          .getByRole('button', { name: '验收', exact: true })
        await expect(openAcceptance, '详情里没有「验收」入口').toBeEnabled({
          timeout: STEP_TIMEOUT_MS,
        })
        await openAcceptance.click()

        const modal = client!.page.locator('.acceptance-modal')
        await expect(modal, '验收弹窗没有打开').toBeVisible({ timeout: STEP_TIMEOUT_MS })
        await modal.getByRole('button', { name: /验收通过/ }).click()
        await modal.getByRole('button', { name: /提交验收结论/ }).click()

        await waitForRequirementStatus(request, pre.client, requirementId, 'pending_final')
      })

      // ------------------------------------------------------------ 缴尾款
      await test.step('需求方支付尾款', async () => {
        await payMilestone(client!, requirementId, '尾款')
      })

      // ------------------------------------------------------------ 分账结单
      await test.step('等待分账结单并核对四流一致', async () => {
        // 等待期 0 天；尾款到账后由支付回调同步调用 confirm_final_split 结单。
        const completed = await waitForRequirementStatus(
          request,
          pre.client,
          requirementId,
          'completed',
          SETTLEMENT_TIMEOUT_MS,
        )
        expect(completed.status).toBe('completed')

        const settlements = await waitForSettlementSucceeded(
          request,
          pre.admin,
          requirementId,
          SETTLEMENT_TIMEOUT_MS,
        )
        expect(
          settlements.map((row) => row.milestone).sort(),
          '定金与尾款两条分账都要结单',
        ).toEqual(['deposit', 'final'])

        // 合同流：双方已签且签署时间落库。
        const contract = await getRequirementContract(request, pre.client, requirementId)
        expect(contract.status, '结单后合同应当是已签约 2').toBe(2)
        expect(contract.party_a_signed_at, '甲方签署时间应当落库').toBeTruthy()
        expect(contract.party_b_signed_at, '乙方签署时间应当落库').toBeTruthy()

        // 资金流：定金（20%）+ 尾款（80%）恰好等于预算。
        const total = settlements.reduce((sum, row) => sum + Number(row.amountCny), 0)
        expect(total, '两条分账金额之和应当等于合同总价').toBeCloseTo(BUDGET_CNY, 2)

        // 金额守恒（与数据库 CHECK 同一口径）：平台服务费 + 开发者税前收入 = 客户实付。
        const budgetFen = Math.round(BUDGET_CNY * 100)
        const platformFeeFen = settlements.reduce(
          (sum, row) => sum + Number(row.platformFeeFen ?? 0),
          0,
        )
        const developerGrossFen = settlements.reduce(
          (sum, row) => sum + Number(row.developerGrossAmountFen ?? 0),
          0,
        )
        const developerNetFen = settlements.reduce(
          (sum, row) => sum + Number(row.developerNetAmountFen ?? 0),
          0,
        )
        expect(
          platformFeeFen + developerGrossFen,
          '平台服务费 + 开发者税前收入应当等于合同总价',
        ).toBe(budgetFen)
        expect(developerGrossFen, '开发者税前收入不应当低于净得').toBeGreaterThanOrEqual(
          developerNetFen,
        )

        // ---------------------------------------------------------- 发票流
        // 开票时序：发票流只能在资金流走完之后开始，所以上面两步必须先成立。
        const summary = await getInvoiceSummary(request, pre.client, requirementId)
        expect(
          summary.platformFeeFen,
          '可开票汇总的平台服务费应当等于两条分账之和',
        ).toBe(platformFeeFen)
        expect(
          summary.developerGrossAmountFen,
          '可开票汇总的开发者税前收入应当等于两条分账之和',
        ).toBe(developerGrossFen)
        expect(summary.platformInvoice, '开票之前不应当已经有平台票').toBeNull()
        expect(summary.developerInvoice, '开票之前不应当已经有开发者票').toBeNull()

        const applied = await applyInvoices(request, pre.client, {
          requirement_id: requirementId,
          invoice_title: summary.buyer.title,
          tax_number: summary.buyer.taxNumber,
          recipient_email: summary.buyer.email,
        })
        expect(applied.platformInvoice, '需求方应当能开出平台服务费票').not.toBeNull()
        expect(applied.developerInvoice, '需求方应当能开出开发者收入票').not.toBeNull()
        expect(applied.platformInvoice?.invoiceRole, '平台票的 invoice_role').toBe('platform')
        expect(applied.developerInvoice?.invoiceRole, '开发者票的 invoice_role').toBe('developer')
        expect(applied.platformInvoice?.amountFen, '平台票票面应当等于平台服务费').toBe(
          platformFeeFen,
        )
        expect(applied.developerInvoice?.amountFen, '开发者票票面应当等于开发者税前收入').toBe(
          developerGrossFen,
        )
        expect(applied.platformInvoice?.requirementId, '两张票都要挂在同一条需求上').toBe(
          requirementId,
        )

        const myInvoices = await listMyInvoices(request, pre.client)
        const invoiceIds = new Set(myInvoices.map((row) => row.id))
        expect(
          invoiceIds.has(applied.platformInvoice?.id ?? -1)
            && invoiceIds.has(applied.developerInvoice?.id ?? -1),
          '两张票都应当出现在「我的发票」里',
        ).toBeTruthy()

        // ---------------------------------------------------------- 会话流
        // 平台把每一步流转写成会话卡片，卡片本身就是流程留痕，可用来反向核对四流。
        const conversation = await getRequirementConversation(request, pre.client, requirementId)
        const cardTypes = conversation.messages
          .filter((item) => item.message_type === 'card')
          .map((item) => item.action_type ?? '')
        for (const expectedCard of [
          'contract_signed',
          'deposit_paid',
          'delivery_submitted',
          'acceptance_passed',
          'final_paid',
        ]) {
          expect(
            cardTypes,
            `会话卡片应当覆盖流程节点 ${expectedCard}，实际卡片：${JSON.stringify(cardTypes)}`,
          ).toContain(expectedCard)
        }
        expect(
          conversation.messages.some((item) => item.message_type === 'text'),
          '会话里应当同时保留双方手发的文本消息',
        ).toBeTruthy()
      })
    } finally {
      // 关上下文要设上限：实测断言失败后 `context.close()` 会一直卡着，
      // 直到 Playwright 的整例超时（25 分钟）才收场——一次失败要多等二十分钟，
      // 期间浏览器进程也一直挂着。这里每个上下文最多等 10 秒，剩下交给 worker 退出时收拾。
      await closeActorQuietly(client)
      await closeActorQuietly(developer)
      await closeActorQuietly(admin)
      if (deliveryDir) {
        await rm(deliveryDir, { recursive: true, force: true }).catch(() => undefined)
      }
    }
  })
})

/** 等合同落到目标状态（合同是异步落库，创建完立刻查会查不到；整数状态见 `CONTRACT_STATUS`）。 */
async function waitForRequirementContract(
  request: APIRequestContext,
  token: string,
  requirementId: string,
  expected: number,
  timeoutMs = STEP_TIMEOUT_MS,
): Promise<RequirementContract> {
  const deadline = Date.now() + timeoutMs
  let latest: RequirementContract | null = null
  while (Date.now() < deadline) {
    latest = await getRequirementContract(request, token, requirementId).catch(() => null)
    if (latest && latest.status === expected) return latest
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
  throw new Error(
    `需求 ${requirementId} 的合同在 ${timeoutMs}ms 内没有进入 ${expected}，当前：${JSON.stringify(latest)}`,
  )
}

/**
 * 「需求方点支付」的完整 UI 路径。
 *
 * 两次点击不是冗余：第一次展开详情里的支付面板（`payVisible`），第二次才真正下单；
 * 下单后前端 `router.push` 到 `/#/payment` 支付页。本地开着支付模拟，
 * 支付页轮询到的第一条结果就是已支付，因此直接等「支付成功」。
 */
async function payMilestone(client: Actor, requirementId: string, stage: '定金' | '尾款') {
  // 同样要整页重载：支付入口是否出现取决于「合同已签 + 状态已推进」这些刚落库的变化。
  await gotoFresh(
    client,
    CLIENT_ORIGIN,
    CLIENT_ACCOUNT.username,
    requirementDetailRoute(requirementId),
  )

  const primary = client.page.locator(
    '.my-requirement-detail__actions .my-requirement-detail__primary',
  )
  await expect(primary, `详情里没有「支付${stage}」入口`).toContainText(`支付${stage}`, {
    timeout: STEP_TIMEOUT_MS,
  })
  await primary.click()

  await expect(
    client.page.locator('.my-requirement-detail__payment-panel'),
    '支付面板没有展开',
  ).toBeVisible({ timeout: STEP_TIMEOUT_MS })
  await primary.click()

  await expect(
    client.page.getByRole('heading', { name: '支付成功' }),
    `${stage}没有确认到账：确认本地 simulation_enabled = true 且 environment = "test"`,
  ).toBeVisible({ timeout: 2 * 60 * 1000 })

  // 离开支付页，避免它留下的定时器影响后续步骤。
  // 只等 `domcontentloaded`：这里的目的仅是卸载支付页，页面数据由下一步的
  // `gotoFresh` 重新冷启动拉取，不需要等网络静默（等静默会被支付页的轮询拖住）。
  await client.page.goto(hashUrl(CLIENT_ORIGIN, '/workbench/requirements'), {
    waitUntil: 'domcontentloaded',
  })
}

/**
 * 爱签真实签署（`E2E_SIGN_MODE=asign`）。
 *
 * 必须有头运行：本机实测爱签签署页不接受万能短信码，只能由人在窗口里填真实短信码
 * （见 `asign-site.ts` 顶部结论）。提交验证码之后爱签侧的签名落位与最终确认本机没跑通过，
 * 所以这里不做臆测，只把控制权交回：签署完成后爱签会回跳本地前端，
 * `ContractSignView` 的 `loadContract` 会调 `asign-sync` 拉状态，用例靠
 * `waitForContractSigned` 判定是否真的签成。
 */
async function signOnAsignSiteHeaded(
  actor: Actor,
  requirementId: string,
  party: 'developer' | 'client',
) {
  if (process.env.E2E_HEADED !== '1') {
    throw new Error(
      'E2E_SIGN_MODE=asign 需要有头模式：爱签签署页的短信验证码只能人工输入。'
        + '请加 E2E_HEADED=1 重跑，并在弹出的签署页窗口里填真实短信码。',
    )
  }

  await actor.page.goto(contractSignUrl(
    party === 'developer' ? DEVELOPER_ORIGIN : CLIENT_ORIGIN,
    requirementId,
  ))

  const startSign = actor.page.getByRole('button', { name: /开始签署/ })
  await expect(startSign, '签署页没有「开始签署」按钮（合同状态可能已不是待本方签署）')
    .toBeEnabled({ timeout: STEP_TIMEOUT_MS })
  await startSign.click()

  // 点了「开始签署」且未勾「短信通知签署」时，页面会 `window.location.href` 跳到爱签。
  const signed = await signOnAsignSite(actor.page)
  expect(signed, `${party === 'developer' ? '开发者' : '需求方'}在爱签签署页没有完成签署`).toBeTruthy()

  // 爱签签完会回跳本地前端；回到签署页让前端把状态同步回后端。
  await actor.page.goto(contractSignUrl(
    party === 'developer' ? DEVELOPER_ORIGIN : CLIENT_ORIGIN,
    requirementId,
  ))
}
