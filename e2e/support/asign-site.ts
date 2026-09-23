/**
 * 爱签签署页的操作封装。
 *
 * 已实测的页面事实（2026-09-23，app_id 140593923，prev.asign.cn）：
 * - `POST /api/contract/{id}/asign-sign` 返回的 `sign_url`（`https://h5.asign.cn/web/short/xxx`）
 *   会 302 到 `https://pre.asign.cn/m/#/mobile/viewApiContract/...`，页面标题「柒叁信息签署」。
 * - 页面是 Element Plus（`el-*`）写的移动端 H5，直接进文档签署视图，**不要求**爱签侧实名
 *   或 MSCA 扫脸——开发者账号在爱签侧是「陌生用户」，照样能到签署页。
 * - 页面上的「完成签署」会弹出「签署意愿确认」短信框，短信发往实名记录里的手机号。
 *   该弹窗里的确认按钮文案带空格：`确 定`（class `el-button sub-btn el-button--primary`），
 *   所以按可访问名 `确定` 匹配不到，要按 class 或 `确 定` 匹配。
 * - **短信码拦路**：本机实测万能码 `111111`（skills/asign 文档里写的测试环境万能码）
 *   与 `123456` 都被爱签拒绝，接口返回 `{"code":0,"msg":"验证码错误，请重新输入"}`。
 *   也就是说这一 app_id 下万能码没开，只能由人工读真实短信。
 *
 * 结论：全自动只做到「打开签署页 → 点完成签署 → 填验证码 → 提交」。
 * 之后（短信通过之后的签名落位与最终确认）本机没跑过去，所以本模块**不臆造**那几步，
 * 而是把控制权交回调用方：`signOnAsignSite` 提交验证码后轮询回调，
 * 由用例用后端 `signing-status` 判断是否签成；`asign` 模式下这一步需要人工在**有头**窗口里
 * 把手头短信码填进去（或用 `E2E_ASIGN_SMS_CODE` 传真实码）。
 */
import { expect, type Page } from '@playwright/test'

import { ASIGN_SMS_CODE, SIGN_HUMAN_WAIT_MS, STEP_TIMEOUT_MS } from './config'

/** 签署页上的关键控件。 */
const SIGN_DONE_BUTTON = '完成签署'
const SMS_INPUT_PLACEHOLDER = '请输入短信验证码'
const SMS_SUBMIT_CLASS = 'button.sub-btn'

/** 是否已经停在爱签签署页（用于确认 `window.location.href` 跳转成功）。 */
export async function waitForAsignSignPage(page: Page): Promise<void> {
  await expect(
    page.getByRole('button', { name: SIGN_DONE_BUTTON }).first(),
    '没有进到爱签签署页：确认 sign_url 可访问，且本机能连通 prev.asign.cn',
  ).toBeVisible({ timeout: STEP_TIMEOUT_MS })
}

/**
 * 在爱签签署页上完成签署。
 *
 * @param page 已 `goto` 到 `sign_url` 的页面（跳转由调用方负责，因为回跳地址是本地前端）
 * @param smsCode 短信验证码；不传则用 `E2E_ASIGN_SMS_CODE` / `111111`
 * @returns 是否把验证码提交成功（提交成功不等于签成，签成与否要由后端状态判定）
 */
export async function signOnAsignSite(page: Page, smsCode?: string): Promise<boolean> {
  await waitForAsignSignPage(page)

  // 1) 点「完成签署」→ 弹「签署意愿确认」短信框。
  await page.getByRole('button', { name: SIGN_DONE_BUTTON }).first().click({ timeout: STEP_TIMEOUT_MS })

  const smsInput = page.getByPlaceholder(SMS_INPUT_PLACEHOLDER).first()
  await expect(
    smsInput,
    '点了「完成签署」但没有弹出短信验证码框：爱签签署页结构可能变了，见本文件顶部注释',
  ).toBeVisible({ timeout: STEP_TIMEOUT_MS })

  // 2) 只在「装着短信输入框的那个可见弹窗」里操作，避免命中页面上其它预渲染的 el-dialog。
  const dialog = page.locator('.el-dialog:visible').filter({ has: smsInput })
  await smsInput.fill(smsCode ?? ASIGN_SMS_CODE)

  // 3) 提交。按钮文案是「确 定」，按 class 取更稳。
  await dialog.locator(SMS_SUBMIT_CLASS).first().click({ timeout: STEP_TIMEOUT_MS })

  // 4) 判定验证码是否被接受：弹窗消失即通过；仍显示则被拒。
  const accepted = await dialog
    .waitFor({ state: 'hidden', timeout: 20_000 })
    .then(() => true)
    .catch(() => false)
  if (accepted) return true

  const message = await page
    .locator('.el-message')
    .allInnerTexts()
    .then((items) => items.join(' ').trim())
    .catch(() => '')
  console.warn(`爱签短信验证码未被接受${message ? `：${message}` : ''}`)

  // 5) 人工兜底：有头模式下留时间让操作者直接在这个窗口里补真实短信码。
  if (SIGN_HUMAN_WAIT_MS > 0) {
    console.warn(
      `爱签短信码需要人工输入：请在打开的浏览器窗口里填入真实短信验证码，最多等 ${Math.round(SIGN_HUMAN_WAIT_MS / 1000)} 秒。`,
    )
    return dialog
      .waitFor({ state: 'hidden', timeout: SIGN_HUMAN_WAIT_MS })
      .then(() => true)
      .catch(() => false)
  }
  return false
}
