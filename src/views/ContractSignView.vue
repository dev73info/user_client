<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { TIcon, ArrowLeft, Refresh } from 'ui_73info'
import { useRoute, useRouter } from 'vue-router'
import {
    fetchAsignContractPreviewUrl,
    fetchDeveloperAgreement,
    fetchMyContract,
    fetchMyRequirementContract,
    initiateAsignSign,
    syncAsignSignStatus,
    type ContractAttachmentParty,
    type ContractDetail,
} from '@/api/contracts'
import { ATTACHMENT_REVIEW_STATUS, CONTRACT_STATUS, contractEffectiveUntilLabel, contractStatusLabel } from '@/shared/contracts'
import ContractAttachmentPanel from '@/components/ContractAttachmentPanel.vue'
import { contractWaitingMessage } from '@/utils/contractSignatures'
import { fetchRequirementDetail, type RequirementItem } from '@/api/requirements'
import {
    ARCHIVED_WRITE_BLOCKED_MESSAGE,
    developmentCycleLabel,
    isRequirementArchived,
    requirementArchiveBanner,
} from '@/shared/requirementArchive'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const requirementId = String(route.query.requirement_id ?? '')
const isWorkbenchSignature = computed(() => route.name === 'workbench-signature-detail')
const isDeveloperAgreement = computed(() => route.query.agreement === 'developer' || contract.value?.template_name === 'developer_agreement')
const DEVELOPER_AGREEMENT_REDIRECT_KEY = '73info_developer_agreement_redirect'
/** 需求合同：记住从哪进来的（`from=user|dev`），爱签整页回跳后 query 会丢。 */
const REQUIREMENT_SIGN_FROM_KEY = '73info_requirement_sign_from'
/**
 * 用户点了「去爱签签署」之后置位：回跳并同步到「已签约」时自动离开签署页，
 * 避免爱签 redirectUrl 又落回同一页（签署后又跳转到原地）。
 * 主动打开已签合同详情时不置位，不会被误踢走。
 */
const REQUIREMENT_SIGN_PENDING_RETURN_KEY = '73info_requirement_sign_pending_return'

function normalizeRedirectTarget(value: unknown): string {
    const raw = typeof value === 'string' ? value.trim() : ''
    if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
        return ''
    }
    return raw
}

function readSessionValue(key: string): string {
    if (typeof window === 'undefined') {
        return ''
    }
    try {
        return window.sessionStorage.getItem(key)?.trim() ?? ''
    } catch {
        return ''
    }
}

function writeSessionValue(key: string, value: string) {
    if (typeof window === 'undefined') {
        return
    }
    try {
        window.sessionStorage.setItem(key, value)
    } catch {
        // sessionStorage 不可用时仍可依赖当前路由参数。
    }
}

function clearSessionValue(key: string) {
    if (typeof window === 'undefined') {
        return
    }
    try {
        window.sessionStorage.removeItem(key)
    } catch {
        // sessionStorage 不可用时忽略清理。
    }
}

const redirectTarget = computed(() => {
    const queryTarget = normalizeRedirectTarget(route.query.redirect_to)
    if (queryTarget) {
        return queryTarget
    }

    return normalizeRedirectTarget(readSessionValue(DEVELOPER_AGREEMENT_REDIRECT_KEY))
})

function rememberRedirectTarget() {
    const target = normalizeRedirectTarget(route.query.redirect_to)
    if (!target) {
        return
    }
    writeSessionValue(DEVELOPER_AGREEMENT_REDIRECT_KEY, target)
}

function clearRememberedRedirectTarget() {
    clearSessionValue(DEVELOPER_AGREEMENT_REDIRECT_KEY)
}

function rememberRequirementSignContext() {
    if (isWorkbenchSignature.value || isDeveloperAgreement.value) {
        return
    }
    const from = typeof route.query.from === 'string' ? route.query.from.trim() : ''
    if (from === 'user' || from === 'dev') {
        writeSessionValue(REQUIREMENT_SIGN_FROM_KEY, from)
    }
}

function markRequirementSignPendingReturn() {
    writeSessionValue(REQUIREMENT_SIGN_PENDING_RETURN_KEY, '1')
}

function clearRequirementSignPendingReturn() {
    clearSessionValue(REQUIREMENT_SIGN_PENDING_RETURN_KEY)
}

function requirementSignReturnTarget(): string | { name: string } {
    const remembered = normalizeRedirectTarget(route.query.redirect_to) || redirectTarget.value
    if (remembered) {
        return remembered
    }
    const from = (typeof route.query.from === 'string' ? route.query.from.trim() : '')
        || readSessionValue(REQUIREMENT_SIGN_FROM_KEY)
    if (from === 'dev') {
        return { name: 'dev-my-requirements' }
    }
    if (from === 'user') {
        return { name: 'workbench-requirements' }
    }
    if (isWorkbenchSignature.value) {
        return { name: 'workbench-signatures' }
    }
    return { name: 'workbench-requirements' }
}

const loading = ref(true)
const signing = ref(false)
const contract = ref<ContractDetail | null>(null)
const error = ref('')
const successMsg = ref('')
// 发起爱签签署时是否短信通知签署人，默认不通知。
const noticeSigner = ref(false)
// 已签署的合同不再在本地铺正文（爱签那份才是准的），只有爱签取不到预览链接时才回退本地正文。
const localDocumentFallback = ref(false)

// 已发起爱签签署但本地仍是待签署时，主动轮询爱签状态。
// 爱签回调（callback_url 指向生产域名）在本地开发环境收不到，且爱签侧状态更新可能有延迟，
// 所以前端周期性调用 syncAsignSignStatus，直到合同变为已签署后自动跳转。
// 轮询间隔保持 3s：爱签侧状态更新约需十几秒，无需 1s 级轮询；
// 且后端对写接口有 15 次/分限流（asign-sync 已单独放宽），1s 轮询会触发 429 导致同步延迟。
const POLL_INTERVAL_MS = 3000
let statusPollTimer: ReturnType<typeof setInterval> | null = null

function stopStatusPolling() {
    if (statusPollTimer !== null) {
        clearInterval(statusPollTimer)
        statusPollTimer = null
    }
}

// 单次状态同步：查询爱签签署状态并更新本地合同，已签署则停止轮询并继续后续动作。
async function pollStatusOnce() {
    if (signing.value || loading.value || !contract.value) return
    const item = contract.value
    // 只有「签约中 1」还需要向爱签同步；已签约 2 与其余终态（3/4/6/7）、未发起 0 都停轮询。
    if (item.status !== CONTRACT_STATUS.signing) {
        stopStatusPolling()
        return
    }
    try {
        const updated = await syncAsignSignStatus(auth.token, item.id)
        contract.value = updated
        if (updated.status !== CONTRACT_STATUS.signing) {
            stopStatusPolling()
        }
        if (updated.status === CONTRACT_STATUS.signed) {
            continueAfterSignCompleted()
        }
    } catch {
        // 单次同步失败不中断轮询，继续重试。
    }
}

function startStatusPolling() {
    stopStatusPolling()
    statusPollTimer = setInterval(() => {
        void pollStatusOnce()
    }, POLL_INTERVAL_MS)
    // 立即执行一次，避免首个轮询周期内的空白，缩短从爱签返回后的等待。
    void pollStatusOnce()
}

type ContractParty = 'party_a' | 'party_b'

type PartyDisplay = {
    party: ContractParty
    label: string
    role: string
    legalName: string
    idCardNo: string
    username: string
    email: string
    signedAt: string | null
}

const signingLogs = computed(() => contract.value?.signing_logs ?? [])
const currentParty = computed<'party_a' | 'party_b' | null>(() => {
    if (!contract.value || !auth.username) return null
    if (contract.value.party_a_username === auth.username) return 'party_a'
    if (contract.value.party_b_username === auth.username) return 'party_b'
    return null
})
const canSignContract = computed(() => {
    if (!contract.value || !currentParty.value) return false
    // 只有「签约中 1」可签：0 未发起 / 2 已签约 / 3 过期 / 4 拒签 / 6 作废 / 7 撤销都不能签。
    if (contract.value.status !== CONTRACT_STATUS.signing) return false
    // 双方各自独立签署，不设先后顺序（爱签侧同样是无序签约 signOrder=1）：
    // 谁还没签谁就能签，双方都签完后由爱签同步置为「已签约 2」。
    return currentParty.value === 'party_a'
        ? !contract.value.party_a_signed_at
        : !contract.value.party_b_signed_at
})
// 从需求列表 / 需求会话的「查看合同」进来时，页面同样要能看清是谁在什么时候签的。
// 只有在本人还需要签署时才收起这些区块，保持签署流程页只聚焦签署动作。
const showSignatureFacts = computed(() => isWorkbenchSignature.value || !canSignContract.value)
// 「在等谁签」与「在等渠道同步」的文案判定收在 utils 里，便于单测覆盖（含两人都已签、
// 本地仍停在「签约中」的同步窗口）。
const waitingMessage = computed(() =>
    contract.value ? contractWaitingMessage(contract.value, auth.username) : '',
)
const currentSigner = computed(() => (currentParty.value ? partyDisplay(currentParty.value) : null))
const signerIdentityReady = computed(() => {
    const signer = currentSigner.value
    return Boolean(signer?.legalName && signer?.idCardNo && signer.idCardNo !== '未完成实名认证')
})
/** 是否存在自定义合同附件（`content_source != platform`）。 */
const hasCustomAttachment = computed(
    () => (contract.value?.content_source ?? 'platform') !== 'platform',
)
/**
 * 附件是否已放行到**当前这一版**。
 *
 * 放行是「对某个具体版本」放行的：审核通过时后端把当次附件指纹记进 `attachment_approved_sha256`，
 * 只有它与 `attachment_file_sha256` 一致才视为已放行——放行后重传/重新拟定会改指纹，旧放行自动失效。
 * 没有自定义附件（平台生成）时不受这道闸门约束。
 */
const attachmentApproved = computed(() => {
    const item = contract.value
    if (!item || !hasCustomAttachment.value) return true
    if (item.attachment_review_status !== ATTACHMENT_REVIEW_STATUS.approved) return false
    return Boolean(item.attachment_file_sha256) &&
        item.attachment_approved_sha256 === item.attachment_file_sha256
})
/** 附件未放行时给出的中文说明；为空表示不拦签署。 */
const attachmentGateMessage = computed(() => {
    if (attachmentApproved.value) return ''
    const status = contract.value?.attachment_review_status ?? ATTACHMENT_REVIEW_STATUS.none
    if (status === ATTACHMENT_REVIEW_STATUS.rejected) {
        return '自定义合同附件已被平台驳回，请修改后重新提交并等待审核'
    }
    return '自定义合同附件待平台审核通过后才能发起签署'
})
/** 附件准备入口所在的需求编号：合同详情页没有 query，就从合同上取。 */
const attachmentRequirementId = computed(
    () => contract.value?.requirement_id?.trim() || requirementId,
)
/** 自定义附件只存在于需求合同上：开发者入驻协议不展示该面板。 */
const showAttachmentPanel = computed(
    () => !isDeveloperAgreement.value && Boolean(attachmentRequirementId.value),
)
const currentPartyAsAttachmentParty = computed<ContractAttachmentParty | null>(
    () => currentParty.value,
)
// R014：需求单的「合同有效期届满 → 超期锁定 / 已清除」状态。合同详情本身不带归档标记，
// 借需求详情（`requireId`）读一次；读取即触发后端收口，返回的就是最新状态。
const requirementArchive = ref<RequirementItem | null>(null)
/** 已进入锁定 / 已清除：写操作一律被后端拒绝，页面据此置灰。 */
const requirementArchived = computed(
    () => requirementArchive.value != null && isRequirementArchived(requirementArchive.value),
)
/** 锁定 / 清除横幅（未归档时 title 为空串，模板据此不渲染）。 */
const archiveBanner = computed(() =>
    requirementArchive.value
        ? requirementArchiveBanner(requirementArchive.value)
        : { state: 'active' as const, title: '', description: '' },
)
/** 归档态下签署按钮旁的中文说明（清除态无「锁定期」可言，单独一句）。 */
const archiveSignBlockedMessage = computed(() =>
    archiveBanner.value.state === 'cleared'
        ? '合同资料已清除，不能再发起签署。'
        : ARCHIVED_WRITE_BLOCKED_MESSAGE,
)
/** R014：合同有效期截止（担保合同的签署完成时写入）；未签署完成给中文说明，不显示空值。 */
const effectiveUntilLabel = computed(() =>
    contract.value ? contractEffectiveUntilLabel(contract.value.status, contract.value.effective_until) : '',
)
/** R014：签约时快照的开发周期（天）；无值不渲染。 */
const developmentCycleText = computed(() => developmentCycleLabel(contract.value?.development_cycle_days))
/** 签署可用性：合同可签 + 实名齐全 + 附件已放行（平台生成的合同不受附件闸门约束）+ 未进入到期归档。 */
const canSubmitSign = computed(
    () => canSignContract.value && signerIdentityReady.value && !signing.value && attachmentApproved.value && !requirementArchived.value,
)
/** 附件变更（上传/拟定/撤回）后把页面上的合同换成后端最新那份，避免停在旧审核态。 */
function applyUpdatedContract(updated: ContractDetail) {
    contract.value = updated
    successMsg.value = ''
    error.value = ''
}
// 开发者入驻协议签署完成后的引导按钮；工作台签署详情已有「返回我的合同」入口，不在此重复展示。
const showBecomeDeveloper = computed(
    () => !isWorkbenchSignature.value && isDeveloperAgreement.value && contract.value?.status === CONTRACT_STATUS.signed,
)

function displayText(value: string | null | undefined, fallback: string): string {
    const text = value?.trim()
    return text ? text : fallback
}

function partyDisplay(party: ContractParty): PartyDisplay | null {
    const item = contract.value
    if (!item) return null
    // 开发者入驻协议：甲方为平台（官方），乙方为开发者。
    const partyARole = isDeveloperAgreement.value ? '平台' : '需求方'

    if (party === 'party_a') {
        return {
            party,
            label: '甲方',
            role: partyARole,
            legalName: displayText(item.party_a_real_name ?? item.party_a_name, '未完成实名认证'),
            idCardNo: displayText(item.party_a_id_card_no_masked, '未完成实名认证'),
            username: displayText(item.party_a_username, '未绑定账号'),
            email: displayText(item.party_a_account_email, '未绑定邮箱'),
            signedAt: item.party_a_signed_at,
        }
    }

    return {
        party,
        label: '乙方',
        role: '开发者',
        legalName: displayText(item.party_b_real_name ?? item.party_b_name, '未完成实名认证'),
        idCardNo: displayText(item.party_b_id_card_no_masked, '未完成实名认证'),
        username: displayText(item.party_b_username, '未绑定账号'),
        email: displayText(item.party_b_account_email, '未绑定邮箱'),
        signedAt: item.party_b_signed_at,
    }
}

/**
 * 状态 chip 的语义色 token。
 *
 * 数字状态码不进 CSS 类名（`.contract-status-chip--1` 这种名字既读不懂又不好加档），
 * 样式里只认这些语义档；未知码回退到最中性的 `waiting` 档。
 */
const CONTRACT_STATUS_TONES: Record<number, string> = {
    [CONTRACT_STATUS.awaiting]: 'waiting',
    [CONTRACT_STATUS.signing]: 'signing',
    [CONTRACT_STATUS.signed]: 'signed',
    [CONTRACT_STATUS.expired]: 'expired',
    [CONTRACT_STATUS.rejected]: 'rejected',
    [CONTRACT_STATUS.voided]: 'void',
    [CONTRACT_STATUS.revoked]: 'revoked',
}

function contractStatusTone(status: number): string {
    return CONTRACT_STATUS_TONES[status] ?? 'waiting'
}

async function loadContract() {
    loading.value = true
    error.value = ''
    try {
        if (isWorkbenchSignature.value) {
            contract.value = await fetchMyContract(auth.token, Number(route.params.contractId))
        } else if (isDeveloperAgreement.value) {
            contract.value = await fetchDeveloperAgreement(auth.token)
        } else {
            contract.value = await fetchMyRequirementContract(auth.token, requirementId)
        }
        // 已发起爱签签署但本地仍是待签署（回调可能延迟/丢失）：主动向爱签同步状态。
        // 用户从爱签签署页返回本页时，若已在爱签完成签署，这里会把本地合同更新为已签署。
        // 若同步后仍未签署，则启动轮询持续同步，直到爱签侧完成或合同变为已签署。
        const item = contract.value
        if (item && item.status === CONTRACT_STATUS.signing) {
            const hasInitiated = (item.signing_logs ?? []).some(
                (log) => log.action === 'asign_sign_initiated',
            )
            if (hasInitiated) {
                try {
                    contract.value = await syncAsignSignStatus(auth.token, item.id)
                } catch {
                    // 同步失败不阻断页面展示，保留已加载状态。
                }
                if (contract.value?.status === CONTRACT_STATUS.signing) {
                    startStatusPolling()
                }
            }
        }
        // R014：读一次需求详情拿「超期锁定 / 已清除」标记（读取即触发后端收口）。失败不阻断合同展示。
        const rid = contract.value?.requirement_id?.trim() || requirementId
        if (!isDeveloperAgreement.value && rid) {
            try {
                requirementArchive.value = await fetchRequirementDetail(auth.token, rid)
            } catch {
                requirementArchive.value = null
            }
        } else {
            requirementArchive.value = null
        }
    } catch (cause) {
        contract.value = null
        error.value = cause instanceof Error ? cause.message : '加载合同失败，请刷新重试'
    } finally {
        loading.value = false
    }
}

/** 签署完成（本地已是「已签约 2」）后的去向：入驻协议与需求合同分流。 */
function continueAfterSignCompleted() {
    if (contract.value?.status !== CONTRACT_STATUS.signed) {
        return
    }

    if (isDeveloperAgreement.value) {
        if (isWorkbenchSignature.value) {
            return
        }
        stopStatusPolling()
        // 开发者协议签署完成后，默认回到收益钱包页（用户来源页优先，丢失时回钱包）。
        const target = redirectTarget.value || { name: 'dev-wallet' }
        clearRememberedRedirectTarget()
        void router.replace(target)
        return
    }

    // 需求合同：只有「刚从爱签签署流程回来」才自动离开。
    // 主动打开已签合同详情（我的合同 / 查看合同回退）时不要踢走。
    if (readSessionValue(REQUIREMENT_SIGN_PENDING_RETURN_KEY) !== '1') {
        return
    }

    stopStatusPolling()
    clearRequirementSignPendingReturn()
    clearSessionValue(REQUIREMENT_SIGN_FROM_KEY)
    clearRememberedRedirectTarget()
    void router.replace(requirementSignReturnTarget())
}

async function handleSign() {
    if (!contract.value || signing.value) return
    // R014：合同有效期届满进入锁定 / 已清除后，签署属写操作，后端一律拒绝；先拦一道并讲清原因。
    if (requirementArchived.value) {
        error.value = ARCHIVED_WRITE_BLOCKED_MESSAGE
        return
    }
    if (!signerIdentityReady.value) {
        error.value = '请先完成实名认证，签署身份必须包含真实姓名和身份证号'
        return
    }
    // 附件闸门：自定义附件未放行（含放行后被换过）时后端也会 409，这里先拦一道并给出可操作说明。
    if (!attachmentApproved.value) {
        error.value = attachmentGateMessage.value || '自定义合同附件待平台审核通过后才能发起签署'
        return
    }
    signing.value = true
    error.value = ''
    try {
        const result = await initiateAsignSign(auth.token, contract.value.id, noticeSigner.value)
        // 无论跳爱签还是短信通知后轮询，签完都要离开「签署页原地」；进爱签前先打标，
        // 整页回跳后 sessionStorage 还在，同步到已签约即可继续走。
        if (!isDeveloperAgreement.value) {
            markRequirementSignPendingReturn()
            rememberRequirementSignContext()
        }
        if (result.sign_url && !noticeSigner.value) {
            // 未勾选短信通知时，跳转到爱签签署页面
            window.location.href = result.sign_url
            return
        }
        if (noticeSigner.value) {
            // 勾选了短信通知：不跳转页面，短信通知签署人，停留本页轮询状态。
            successMsg.value = '已发起并短信通知签署人'
        } else {
            successMsg.value = '已发起签署，请稍后刷新查看签署状态'
        }
        await loadContract()
        if (contract.value?.status === CONTRACT_STATUS.signed) {
            continueAfterSignCompleted()
            return
        }
        startStatusPolling()
    } catch (err) {
        error.value = err instanceof Error ? err.message : '发起签署失败，请稍后重试'
    } finally {
        signing.value = false
    }
}

/**
 * 「查看合同」：跳爱签的合同预览页（previewContract），与需求列表页同一口径。
 *
 * 爱签侧还没有这份合同（例如平台自动生成的协议没走过爱签）时回退本地合同正文，
 * 否则页面上就没有任何地方能看到合同内容了。
 */
async function viewContract() {
    if (!contract.value) return
    try {
        const previewUrl = await fetchAsignContractPreviewUrl(auth.token, contract.value.id)
        if (previewUrl) {
            window.location.href = previewUrl
            return
        }
    } catch {
        // 忽略：回退本地合同正文
    }
    localDocumentFallback.value = true
    error.value = '爱签暂未提供该合同的查看页，以下为本地留存的合同正文'
}

/** 返回上一层级：优先浏览器历史回退，无历史时回工作台。 */
function goBack() {
    if (window.history.length > 1) {
        router.back()
        return
    }
    if (isWorkbenchSignature.value) {
        router.push({ name: 'workbench-signatures' })
        return
    }
    if (isDeveloperAgreement.value) {
        router.push({ name: 'workbench' })
        return
    }
    router.push({ name: 'workbench-requirements' })
}

/** 未实名认证时引导用户去完成实名认证，认证通过后回到签署页。 */
function goRealname() {
    void router.push({
        name: 'workbench-realname',
        query: { redirect_to: route.fullPath },
    })
}

function goBecomeDeveloper() {
    // 跳转到开发者资源初始化入口路由（devArea + requiresDevAccess + requiresRealname），
    // 触发 dev 路由守卫中的 ensureDevAccess → requestDevRole，从而授予开发者角色并刷新 profile。
    // ⚠️ 不能直接跳 /workbench#developer-overview：它只匹配 workbench 路由，
    //    不会触发 dev 守卫，开发者角色申请不会执行，前端 profile 会停留在旧角色。
    // ⚠️ 也不能跳 dev-overview（开发概览）：该页面已废弃，开发者入口应指向资源初始化。
    const target = redirectTarget.value || { name: 'dev-plugins' }
    clearRememberedRedirectTarget()
    void router.replace(target)
}

onMounted(async () => {
    auth.hydrate()
    if (!isWorkbenchSignature.value && !isDeveloperAgreement.value && !requirementId) {
        router.replace('/')
        return
    }
    if (!isWorkbenchSignature.value) {
        rememberRedirectTarget()
        rememberRequirementSignContext()
    }
    if (auth.token) {
        await auth.initializeSession().catch(() => undefined)
    }
    await loadContract()
    continueAfterSignCompleted()
})

onUnmounted(() => {
    stopStatusPolling()
})
</script>

<template>
    <main class="page-shell" :class="{ 'page-shell--workbench': isWorkbenchSignature }">
        <section class="panel">
            <!-- 工作台外壳不再铺页面标题栏，签署页自己出示标题与返回（两种入口同一套页头） -->
            <header class="panel-head">
                <div class="panel-head__title">
                    <h2>{{ isDeveloperAgreement ? '开发者入驻协议' : '需求服务合同' }}</h2>
                    <p v-if="canSignContract" class="lead">请核对实名认证身份后完成签署。</p>
                </div>
                <button type="button" class="btn-secondary panel-head__back" @click="goBack">
                    <TIcon><ArrowLeft /></TIcon>返回
                </button>
            </header>

            <div v-if="loading" class="status-msg">加载中…</div>

            <div v-else-if="!contract" class="status-msg">
                <p :role="error ? 'alert' : 'status'">{{ error || '暂无可签署的合同' }}</p>
                <button type="button" class="btn-secondary" @click="loadContract"><TIcon><Refresh /></TIcon>重新加载</button>
                <button class="btn-secondary" @click="goBack"><TIcon><ArrowLeft /></TIcon>返回</button>
            </div>

            <template v-else>
                <div class="contract-meta">
                    <div class="contract-meta__facts">
                        <p><strong>合同编号：</strong>{{ contract.contract_no }}</p>
                        <p><strong>合同标题：</strong>{{ contract.title }}</p>
                        <p><strong>签署状态：</strong><span class="contract-status-chip"
                                :class="`contract-status-chip--${contractStatusTone(contract.status)}`">{{
                                contractStatusLabel(contract.status)
                                }}</span></p>
                        <p><strong>合同指纹：</strong><span class="hash-text">{{ contract.content_sha256 }}</span></p>
                        <!-- R014：担保合同的有效期截止（＝后签方签署时间 + 开发周期）；未签署完成给中文说明，不显示空值。 -->
                        <p v-if="!isDeveloperAgreement"><strong>有效期截止：</strong><span
                                data-testid="contract-effective-until">{{ effectiveUntilLabel }}</span></p>
                        <p v-if="!isDeveloperAgreement && developmentCycleText"><strong>开发周期：</strong><span
                                data-testid="contract-development-cycle">{{ developmentCycleText }}</span></p>
                        <!-- CT-2：平台作废不联动爱签（爱签 OpenAPI 没有作废/撤回接口），
                             用户可能在渠道侧仍看到这份合同，必须在页面上讲清楚边界。 -->
                        <p v-if="contract.status === CONTRACT_STATUS.voided" class="void-hint">
                            <strong>本合同已由平台作废。</strong>
                            平台作废只影响本站：爱签渠道侧的合同不会同步撤回，请不要再在爱签侧签署这份合同；
                            如已签署，请联系客服处理。
                        </p>
                    </div>
                    <!-- 已签约的合同正文以爱签那份为准，「查看合同」跳爱签预览页。 -->
                    <button v-if="contract.status === CONTRACT_STATUS.signed" class="btn-primary" @click="viewContract">
                        查看合同
                    </button>
                </div>

                <!-- R014：合同有效期届满进入「超期锁定 / 已清除」后的横幅。锁定态仍可下载资料、写操作置灰；
                     清除态只剩审计台账。判定与文案来自 shared/requirementArchive，真值在后端。 -->
                <section v-if="archiveBanner.title" class="archive-banner" :class="`archive-banner--${archiveBanner.state}`"
                    role="status" data-testid="contract-archive-banner">
                    <strong>{{ archiveBanner.title }}</strong>
                    <p>{{ archiveBanner.description }}</p>
                </section>

                <!-- R012：自定义合同附件。双方上传自己的合同文件或在页面内拟定条款，作为主合同的附件随卷签署；
                     必须经平台放行后才能发起签署。开发者入驻协议没有附件，不展示。 -->
                <ContractAttachmentPanel
                    v-if="showAttachmentPanel"
                    :token="auth.token"
                    :contract="contract"
                    :requirement-id="attachmentRequirementId"
                    :party="currentPartyAsAttachmentParty"
                    @updated="applyUpdatedContract"
                />

                <div v-if="successMsg" class="msg-success">{{ successMsg }}</div>
                <div v-if="error" class="msg-error">{{ error }}</div>

                <template v-if="showSignatureFacts">
                    <section class="signature-parties">
                        <h3>签约方</h3>
                        <dl>
                            <div><dt>甲方</dt><dd>{{ contract.party_a_name }}<span>{{ contract.party_a_signed_at ? `已签署 · ${contract.party_a_signed_at}` : '未签署' }}</span></dd></div>
                            <div><dt>乙方</dt><dd>{{ contract.party_b_name }}<span>{{ contract.party_b_signed_at ? `已签署 · ${contract.party_b_signed_at}` : '未签署' }}</span></dd></div>
                            <div v-if="contract.party_c_name"><dt>丙方</dt><dd>{{ contract.party_c_name }}<span>{{ contract.party_c_signed_at ? `已签署 · ${contract.party_c_signed_at}` : '未签署' }}</span></dd></div>
                        </dl>
                    </section>
                    <!-- 已签署的合同正文以爱签那份为准，由「查看合同」入口跳过去；
                         只有爱签取不到预览链接时才回退展示本地正文。 -->
                    <details v-if="showSignatureFacts && (contract.status !== CONTRACT_STATUS.signed || localDocumentFallback)"
                        class="signature-document" open>
                        <summary>{{ hasCustomAttachment ? '平台主合同正文（点击查看）' : '合同正文' }}</summary>
                        <!-- R012：带自定义附件时正文区要讲清「平台正文才是唯一被签署的主文件」，附件只是条款补充。 -->
                        <p v-if="hasCustomAttachment" class="document-source-note">
                            本合同正文由平台按《需求开发合同》生成，仍是唯一被签署的主文件；
                            自定义合同附件随本合同一并签署与归档，只是条款补充。
                        </p>
                        <div class="contract-content">{{ contract.content }}</div>
                    </details>
                </template>

                <section v-if="canSignContract" class="sign-panel">
                    <div class="sign-panel__identity">
                        <h3>本次签署身份</h3>
                        <dl v-if="currentSigner" class="signer-fields">
                            <div>
                                <dt>实名姓名</dt>
                                <dd>{{ currentSigner.legalName }}</dd>
                            </div>
                            <div>
                                <dt>身份证号</dt>
                                <dd>{{ currentSigner.idCardNo }}</dd>
                            </div>
                            <div>
                                <dt>平台账户</dt>
                                <dd>{{ currentSigner.username }} / {{ currentSigner.email }}</dd>
                            </div>
                        </dl>
                        <p v-if="!signerIdentityReady" class="identity-warning">
                            实名认证审核通过后才能签署合同。
                        </p>
                        <button
                            v-if="!signerIdentityReady"
                            type="button"
                            class="btn-realname"
                            @click="goRealname"
                        >
                            去实名认证
                        </button>
                    </div>

                </section>

                <div v-if="canSignContract || waitingMessage || showBecomeDeveloper" class="contract-actions">
                    <label v-if="canSignContract" class="notice-toggle">
                        <input v-model="noticeSigner" type="checkbox" />
                        <span>短信通知签署</span>
                    </label>
                    <button v-if="canSignContract" class="btn-primary" :disabled="!canSubmitSign" @click="handleSign">
                        {{ signing ? '签署中…' : '开始签署' }}
                    </button>
                    <span v-if="requirementArchived" class="badge-pending" data-testid="contract-archive-locked-note">
                        {{ archiveSignBlockedMessage }}
                    </span>
                    <span v-else-if="waitingMessage" class="badge-pending">{{ waitingMessage }}</span>
                    <button
                        v-if="showBecomeDeveloper"
                        class="btn-primary"
                        @click="goBecomeDeveloper"
                    >
                        签署完成，成为开发者
                    </button>
                </div>
                <section v-if="showSignatureFacts" class="signature-history">
                    <h3>签署记录</h3>
                    <p v-if="!signingLogs.length" class="empty-log">暂无签署记录</p>
                    <ol v-else>
                        <li v-for="log in signingLogs" :key="log.id">
                            <time>{{ log.created_at }}</time>
                            <span>{{ log.note || ({ created: '合同已创建', updated: '合同已更新', party_a_signed: '甲方已签署', party_b_signed: '乙方已签署', party_c_signed: '丙方已签署', asign_sign_initiated: '已发起电子签署', asign_sign_completed: '电子签署完成', signed: '签署已完成', void: '合同已作废' } as Record<string, string>)[log.action] || '合同状态已更新' }}</span>
                        </li>
                    </ol>
                </section>
            </template>
        </section>
    </main>
</template>

<style scoped>
.page-shell.page-shell--workbench {
    min-height: auto;
    max-width: 1180px;
    padding: 20px 20px 40px;
    overflow-wrap: anywhere;
}
.page-shell--workbench .panel { padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
.page-shell--workbench .btn-primary { background: #247f7d; border-color: #247f7d; color: #fff; box-shadow: none; }
.page-shell--workbench .btn-secondary { display: inline-flex; align-items: center; justify-content: center; gap: 6px; color: #247f7d; border-color: #cce3e2; background: #fff; white-space: normal; }
.page-shell--workbench .sign-panel { background: #f5fafa; border-color: #cce3e2; }
.page-shell--workbench .contract-meta { border: 0; border-left: 3px solid #247f7d; border-radius: 0; }
.signature-parties, .signature-document, .signature-history { margin: 24px 0; }
.signature-parties h3, .signature-history h3 { font-size: 15px; margin: 0 0 16px; }
.signature-parties dl { margin: 0; display: grid; gap: 14px; }
.signature-parties dl > div { display: grid; grid-template-columns: 50px minmax(0, 1fr); font-size: 14px; gap: 12px; }
.signature-parties dt { color: #667085; }
.signature-parties dd { margin: 0; display: grid; gap: 4px; }
.signature-parties dd span { color: #667085; font-size: 12px; }
.signature-document summary { cursor: pointer; font-weight: 600; font-size: 15px; padding: 14px 0; border-top: 1px solid #e5e9ef; }
/* R012：正文区上方的来源说明（平台正文才是主文件，附件只是条款补充）。 */
.document-source-note { margin: 0 0 14px; padding: 10px 12px; border-radius: 6px; background: #eef6f6; color: #3f5b59; font-size: 12.5px; line-height: 1.7; }
.signature-history { border-top: 1px solid #e5e9ef; padding-top: 24px; }
.signature-history ol { list-style: none; padding: 0; margin: 0; }
.signature-history li { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: 16px; padding: 12px 0; border-bottom: 1px solid #eef1f4; font-size: 13px; }
.signature-history time { color: #667085; }
@media (max-width: 600px) {
    .page-shell.page-shell--workbench { padding: 16px 12px 28px; }
    .signature-history li { grid-template-columns: 1fr; gap: 6px; }
}

.page-shell {
    min-height: 100vh;
    padding: 2.5rem 1rem 3rem;
    max-width: 920px;
    margin: 0 auto;
    color: #172033;
}

.panel {
    background: #fff;
    border-radius: 8px;
    padding: 2rem 2.2rem;
    border: 1px solid #e5e7eb;
    box-shadow: 0 18px 42px rgba(15, 23, 42, 0.12);
}

.panel-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #e8edf4;
}

.panel-head__title {
    min-width: 0;
}

.panel-head__back {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin-left: auto;
}

.panel-head h2 {
    margin: 0;
    color: #f59e0b;
    font-size: 1.65rem;
    font-weight: 800;
    letter-spacing: 0;
}

.panel-head .lead {
    color: #4b5563;
    margin-top: 0.4rem;
    font-size: 0.96rem;
}

.status-msg {
    color: #475569;
    padding: 1rem 0;
}

.contract-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    background: #f8fafc;
    border: 1px solid #dbe5f0;
    border-left: 4px solid #2563eb;
    border-radius: 8px;
    padding: 1rem 1.2rem;
    margin-bottom: 1.5rem;
}

.contract-meta__facts {
    flex: 1 1 auto;
    min-width: 0;
}

.contract-meta > .btn-primary {
    flex: 0 0 auto;
}

.contract-meta p {
    margin: 0.45rem 0;
    color: #243044;
    font-size: 0.95rem;
    line-height: 1.65;
}

.contract-meta strong {
    color: #0f172a;
    font-weight: 750;
}

.contract-status-chip {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 0.12rem 0.6rem;
    border-radius: 999px;
    border: 1px solid #bfdbfe;
    background: #eff6ff;
    color: #1d4ed8;
    font-size: 0.84rem;
    font-weight: 750;
}

.contract-status-chip--signing {
    border-color: #fed7aa;
    background: #fff7ed;
    color: #c2410c;
}

.contract-status-chip--signed {
    border-color: #bbf7d0;
    background: #ecfdf5;
    color: #047857;
}

.contract-content {
    border: 1px solid #cfd8e3;
    border-radius: 8px;
    padding: 1.35rem 1.5rem;
    min-height: 200px;
    background: #ffffff;
    color: #1f2937;
    font-size: 0.94rem;
    line-height: 1.8;
    white-space: pre-wrap;
    margin-bottom: 1.5rem;
    max-height: 60vh;
    overflow-y: auto;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.7);
}

.hash-text {
    display: inline-block;
    max-width: 100%;
    margin-top: 0.2rem;
    padding: 0.28rem 0.45rem;
    border-radius: 5px;
    background: #eaf2ff;
    color: #1e40af;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.86rem;
    font-weight: 700;
    word-break: break-all;
}

.hash-text--compact {
    margin-top: 0;
    padding: 0.18rem 0.36rem;
    font-size: 0.78rem;
}

.hash-inline {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.84rem;
    color: #1d4ed8;
    overflow-wrap: anywhere;
}

.signer-fields {
    display: grid;
    gap: 0.62rem;
    margin: 0;
}

.signer-fields div {
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    gap: 0.6rem;
    align-items: baseline;
}

.signer-fields dt {
    color: #64748b;
    font-size: 0.86rem;
}

.signer-fields dd {
    margin: 0;
    color: #172033;
    font-size: 0.94rem;
    font-weight: 700;
    overflow-wrap: anywhere;
}

.signature-preview,
.log-signature-preview {
    display: block;
    max-width: 100%;
    height: 72px;
    object-fit: contain;
    border: 1px dashed #cbd5e1;
    border-radius: 6px;
    background: #fff;
}

.signature-preview {
    width: 180px;
}

.log-signature-preview {
    width: 220px;
    margin-top: 0.45rem;
}

.evidence-panel {
    border: 1px solid #bfdbfe;
    border-radius: 8px;
    padding: 1rem 1.2rem;
    margin-bottom: 1.5rem;
    background: #eff6ff;
}

.evidence-panel h3 {
    margin: 0 0 0.5rem;
    color: #1e3a8a;
    font-size: 1.08rem;
    font-weight: 800;
}

.evidence-panel p {
    margin: 0.35rem 0;
    color: #334155;
    font-size: 0.9rem;
}

.log-list {
    display: grid;
    gap: 0.65rem;
    margin-top: 0.8rem;
}

.log-item {
    padding: 0.75rem 0.85rem;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    background: #fff;
}

.log-item div {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
}

.log-item span {
    color: #475569;
    font-size: 0.85rem;
}

.empty-log {
    color: #475569;
}

.sign-panel {
    border: 1px solid #fde68a;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1.2rem;
    background: #fffdf5;
}

.sign-panel__identity {
    margin-bottom: 1rem;
}

.sign-panel h3 {
    margin: 0 0 0.65rem;
    color: #172033;
    font-size: 1.02rem;
    font-weight: 800;
}

.identity-warning {
    margin: 0.7rem 0 0;
    color: #b91c1c;
    font-size: 0.9rem;
    font-weight: 700;
}

.btn-realname {
    display: inline-flex;
    align-items: center;
    margin-top: 0.75rem;
    padding: 8px 20px;
    border: 1px solid #bfdbfe;
    border-radius: 6px;
    background: #eff6ff;
    color: #1d4ed8;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    transition:
        background 140ms ease,
        border-color 140ms ease,
        transform 140ms ease;
}

.btn-realname:hover {
    background: #dbeafe;
    border-color: #93c5fd;
    transform: translateY(-1px);
}

.signature-box {
    margin-bottom: 1rem;
}

.signature-box__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.65rem;
}

.btn-text {
    border: none;
    background: transparent;
    color: #1d4ed8;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 750;
}

.signature-canvas {
    display: block;
    width: 100%;
    height: 180px;
    border: 1px dashed #94a3b8;
    border-radius: 8px;
    background: #ffffff;
    touch-action: none;
    cursor: crosshair;
}

.contract-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding-top: 1rem;
    border-top: 1px solid #e2e8f0;
}

.notice-toggle {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #475569;
    font-size: 0.9rem;
    cursor: pointer;
    user-select: none;
}

.notice-toggle input[type='checkbox'] {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: #f59e0b;
}

.btn-primary {
    min-height: 42px;
    padding: 0.75rem 1.8rem;
    background: #f59e0b;
    color: #fff;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.98rem;
    font-weight: 800;
    box-shadow: 0 10px 18px rgba(245, 158, 11, 0.22);
}

.btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.btn-secondary {
    min-height: 42px;
    padding: 0.7rem 1.35rem;
    background: transparent;
    color: #334155;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.95rem;
    font-weight: 650;
}

.badge-pending {
    display: inline-block;
    padding: 0.55rem 1rem;
    background: #fff7ed;
    color: #c2410c;
    border: 1px solid #fed7aa;
    border-radius: 999px;
    font-size: 0.9rem;
    font-weight: 800;
}

.msg-success {
    color: #047857;
    padding: 0.75rem 0.9rem;
    border-radius: 8px;
    background: #ecfdf5;
    border: 1px solid #bbf7d0;
    margin-bottom: 1rem;
    font-weight: 700;
}

.msg-error {
    color: #b91c1c;
    padding: 0.75rem 0.9rem;
    border-radius: 8px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    margin-bottom: 1rem;
    font-weight: 700;
}

/* 已作废合同在渠道侧的提示（CT-2）：平台作废不联动爱签，需要显眼但不吓人。 */
.void-hint {
    color: #92400e;
    padding: 0.75rem 0.9rem;
    border-radius: 8px;
    background: #fffbeb;
    border: 1px solid #fde68a;
    margin-bottom: 1rem;
    line-height: 1.6;
}

/* R014：合同有效期届满进入锁定 / 已清除的横幅。锁定用琥珀提醒（限时保留），清除用中性灰（终态）。 */
.archive-banner {
    margin: 0 0 1rem;
    padding: 0.75rem 0.9rem;
    border-radius: 8px;
    background: #fffbeb;
    border: 1px solid #fde68a;
    color: #92400e;
    line-height: 1.6;
}

.archive-banner--cleared {
    background: #f8fafc;
    border-color: #cbd5e1;
    color: #475569;
}

.archive-banner strong {
    display: block;
    font-weight: 800;
    margin-bottom: 0.25rem;
}

.archive-banner p {
    margin: 0;
    font-size: 0.9rem;
}

@media (max-width: 640px) {
    .page-shell {
        padding: 1rem;
    }

    .panel {
        padding: 1.25rem;
    }

    .contract-content {
        padding: 1rem;
    }

    .signer-fields div {
        grid-template-columns: 1fr;
        gap: 0.2rem;
    }

    .contract-meta {
        flex-direction: column;
        align-items: flex-start;
    }
}
</style>
