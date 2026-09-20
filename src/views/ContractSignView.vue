<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ArrowLeft, Refresh } from '@element-plus/icons-vue'
import { useRoute, useRouter } from 'vue-router'
import {
    fetchAsignContractPreviewUrl,
    fetchDeveloperAgreement,
    fetchMyContract,
    fetchMyRequirementContract,
    initiateAsignSign,
    syncAsignSignStatus,
    type ContractDetail,
} from '@/api/contracts'
import { useAuthStore } from '@/stores/auth'
import { useWorkbenchSubtitle } from '@/composables/useWorkbenchSubtitle'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
// 工作台标题栏的二级标题：让「合同详情」后面跟上具体合同名（如「合同详情/开发者入驻协议」）。
const workbenchSubtitle = useWorkbenchSubtitle()

const requirementId = String(route.query.requirement_id ?? '')
const isWorkbenchSignature = computed(() => route.name === 'workbench-signature-detail')
const isDeveloperAgreement = computed(() => route.query.agreement === 'developer' || contract.value?.template_name === 'developer_agreement')
const DEVELOPER_AGREEMENT_REDIRECT_KEY = '73info_developer_agreement_redirect'

function normalizeRedirectTarget(value: unknown): string {
    const raw = typeof value === 'string' ? value.trim() : ''
    if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
        return ''
    }
    return raw
}

const redirectTarget = computed(() => {
    const queryTarget = normalizeRedirectTarget(route.query.redirect_to)
    if (queryTarget) {
        return queryTarget
    }

    if (typeof window === 'undefined') {
        return ''
    }

    try {
        return normalizeRedirectTarget(window.sessionStorage.getItem(DEVELOPER_AGREEMENT_REDIRECT_KEY))
    } catch {
        return ''
    }
})

function rememberRedirectTarget() {
    const target = normalizeRedirectTarget(route.query.redirect_to)
    if (!target || typeof window === 'undefined') {
        return
    }

    try {
        window.sessionStorage.setItem(DEVELOPER_AGREEMENT_REDIRECT_KEY, target)
    } catch {
        // sessionStorage 不可用时仍可依赖当前路由参数完成回跳。
    }
}

function clearRememberedRedirectTarget() {
    if (typeof window === 'undefined') {
        return
    }

    try {
        window.sessionStorage.removeItem(DEVELOPER_AGREEMENT_REDIRECT_KEY)
    } catch {
        // sessionStorage 不可用时忽略清理。
    }
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
    if (item.status === 'signed' || item.status === 'void' || item.status === 'draft') {
        stopStatusPolling()
        return
    }
    try {
        const updated = await syncAsignSignStatus(auth.token, item.id)
        contract.value = updated
        if (updated.status === 'signed') {
            stopStatusPolling()
            continueAfterDeveloperAgreement()
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
    if (!['pending_party_a', 'pending_party_b'].includes(contract.value.status)) return false
    return currentParty.value === 'party_a'
        ? !contract.value.party_a_signed_at
        : !contract.value.party_b_signed_at
})
// 从需求列表 / 需求会话的「查看合同」进来时，页面同样要能看清是谁在什么时候签的。
// 只有在本人还需要签署时才收起这些区块，保持签署流程页只聚焦签署动作。
const showSignatureFacts = computed(() => isWorkbenchSignature.value || !canSignContract.value)
const waitingMessage = computed(() => {
    if (!contract.value || contract.value.status === 'signed') return ''
    if (currentParty.value === 'party_a') {
        return contract.value.party_a_signed_at ? '等待开发者完成签署' : '等待您完成客户签署'
    }
    if (currentParty.value === 'party_b') {
        return contract.value.party_b_signed_at ? '等待客户完成签署' : '等待您完成开发者签署'
    }
    return ''
})
const currentSigner = computed(() => (currentParty.value ? partyDisplay(currentParty.value) : null))
const signerIdentityReady = computed(() => {
    const signer = currentSigner.value
    return Boolean(signer?.legalName && signer?.idCardNo && signer.idCardNo !== '未完成实名认证')
})
const canSubmitSign = computed(
    () => canSignContract.value && signerIdentityReady.value && !signing.value,
)
// 开发者入驻协议签署完成后的引导按钮；工作台签署详情已有「返回我的签署」入口，不在此重复展示。
const showBecomeDeveloper = computed(
    () => !isWorkbenchSignature.value && isDeveloperAgreement.value && contract.value?.status === 'signed',
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

function statusLabel(status: string): string {
    const labels: Record<string, string> = {
        draft: '草稿',
        pending_party_a: '待甲方签署',
        pending_party_b: '待乙方签署',
        signed: '已签署',
        void: '已作废',
    }
    return labels[status] ?? status
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
        if (item && !['signed', 'void', 'draft'].includes(item.status)) {
            const hasInitiated = (item.signing_logs ?? []).some(
                (log) => log.action === 'asign_sign_initiated',
            )
            if (hasInitiated) {
                try {
                    contract.value = await syncAsignSignStatus(auth.token, item.id)
                } catch {
                    // 同步失败不阻断页面展示，保留已加载状态。
                }
                if (contract.value && contract.value.status !== 'signed') {
                    startStatusPolling()
                }
            }
        }
    } catch (cause) {
        contract.value = null
        error.value = cause instanceof Error ? cause.message : '加载合同失败，请刷新重试'
    } finally {
        loading.value = false
    }
    workbenchSubtitle.value = isWorkbenchSignature.value ? (contract.value?.title ?? '') : ''
}

function continueAfterDeveloperAgreement() {
    if (isWorkbenchSignature.value || !isDeveloperAgreement.value || contract.value?.status !== 'signed') {
        return
    }

    stopStatusPolling()
    // 开发者协议签署完成后，默认回到收益钱包页（用户来源页优先，丢失时回钱包）。
    const target = redirectTarget.value || { name: 'dev-wallet' }
    clearRememberedRedirectTarget()
    void router.replace(target)
}

async function handleSign() {
    if (!contract.value || signing.value) return
    if (!signerIdentityReady.value) {
        error.value = '请先完成实名认证，签署身份必须包含真实姓名和身份证号'
        return
    }
    signing.value = true
    error.value = ''
    try {
        const result = await initiateAsignSign(auth.token, contract.value.id, noticeSigner.value)
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
    if (!isWorkbenchSignature.value) rememberRedirectTarget()
    if (auth.token) {
        await auth.initializeSession().catch(() => undefined)
    }
    await loadContract()
    continueAfterDeveloperAgreement()
})

onUnmounted(() => {
    stopStatusPolling()
    // 离开详情页时清掉标题栏二级标题，避免残留在别的页面。
    workbenchSubtitle.value = ''
})
</script>

<template>
    <main class="page-shell" :class="{ 'page-shell--workbench': isWorkbenchSignature }">
        <section class="panel">
            <!-- 工作台签署详情使用外层工作台标题栏（合同详情/合同名 + 返回），页内不再重复标题与返回。 -->
            <header v-if="!isWorkbenchSignature" class="panel-head">
                <div class="panel-head__title">
                    <h2>{{ isDeveloperAgreement ? '开发者入驻协议' : '需求服务合同' }}</h2>
                    <p v-if="canSignContract" class="lead">请核对实名认证身份后完成签署。</p>
                </div>
                <button type="button" class="btn-secondary panel-head__back" @click="goBack">
                    <el-icon><ArrowLeft /></el-icon>返回
                </button>
            </header>

            <div v-if="loading" class="status-msg">加载中…</div>

            <div v-else-if="!contract" class="status-msg">
                <p :role="error ? 'alert' : 'status'">{{ error || '暂无可签署的合同' }}</p>
                <button type="button" class="btn-secondary" @click="loadContract"><el-icon><Refresh /></el-icon>重新加载</button>
                <button class="btn-secondary" @click="goBack"><el-icon><ArrowLeft /></el-icon>返回</button>
            </div>

            <template v-else>
                <div class="contract-meta">
                    <p><strong>合同编号：</strong>{{ contract.contract_no }}</p>
                    <p><strong>合同标题：</strong>{{ contract.title }}</p>
                    <p><strong>签署状态：</strong><span class="contract-status-chip"
                            :class="`contract-status-chip--${contract.status}`">{{ statusLabel(contract.status)
                            }}</span></p>
                    <p><strong>合同指纹：</strong><span class="hash-text">{{ contract.content_sha256 }}</span></p>
                    <!-- CT-2：平台作废不联动爱签（爱签 OpenAPI 没有作废/撤回接口），
                         用户可能在渠道侧仍看到这份合同，必须在页面上讲清楚边界。 -->
                    <p v-if="contract.status === 'void'" class="void-hint">
                        <strong>本合同已由平台作废。</strong>
                        平台作废只影响本站：爱签渠道侧的合同不会同步撤回，请不要再在爱签侧签署这份合同；
                        如已签署，请联系客服处理。
                    </p>
                </div>

                <div v-if="successMsg" class="msg-success">{{ successMsg }}</div>
                <div v-if="error" class="msg-error">{{ error }}</div>

                <template v-if="showSignatureFacts">
                    <section class="signature-parties">
                        <div class="signature-parties__main">
                            <h3>签约方</h3>
                            <dl>
                                <div><dt>甲方</dt><dd>{{ contract.party_a_name }}<span>{{ contract.party_a_signed_at ? `已签署 · ${contract.party_a_signed_at}` : '未签署' }}</span></dd></div>
                                <div><dt>乙方</dt><dd>{{ contract.party_b_name }}<span>{{ contract.party_b_signed_at ? `已签署 · ${contract.party_b_signed_at}` : '未签署' }}</span></dd></div>
                                <div v-if="contract.party_c_name"><dt>丙方</dt><dd>{{ contract.party_c_name }}<span>{{ contract.party_c_signed_at ? `已签署 · ${contract.party_c_signed_at}` : '未签署' }}</span></dd></div>
                            </dl>
                        </div>
                        <!-- 「查看合同」跟随签约方一起看：已签署的合同正文以爱签那份为准。 -->
                        <button v-if="contract.status === 'signed'" class="btn-primary" @click="viewContract">
                            查看合同
                        </button>
                    </section>
                    <!-- 已签署的合同正文以爱签那份为准，由「查看合同」入口跳过去；
                         只有爱签取不到预览链接时才回退展示本地正文。 -->
                    <details v-if="showSignatureFacts && (contract.status !== 'signed' || localDocumentFallback)"
                        class="signature-document" open>
                        <summary>合同正文</summary>
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
.page-shell--workbench .btn-primary { background: #247f7d; border-color: #247f7d; color: #fff; }
.page-shell--workbench .btn-secondary { display: inline-flex; align-items: center; justify-content: center; gap: 6px; color: #247f7d; border-color: #cce3e2; background: #fff; white-space: normal; }
.page-shell--workbench .sign-panel { background: #f5fafa; border-color: #cce3e2; }
.page-shell--workbench .contract-meta { border: 0; border-left: 3px solid #247f7d; border-radius: 0; }
.signature-parties, .signature-document, .signature-history { margin: 24px 0; }
.signature-parties { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.signature-parties__main { flex: 1 1 auto; min-width: 0; }
.signature-parties h3, .signature-history h3 { font-size: 15px; margin: 0 0 16px; }
.signature-parties dl { margin: 0; display: grid; gap: 14px; }
.signature-parties dl > div { display: grid; grid-template-columns: 50px minmax(0, 1fr); font-size: 14px; gap: 12px; }
.signature-parties dt { color: #667085; }
.signature-parties dd { margin: 0; display: grid; gap: 4px; }
.signature-parties dd span { color: #667085; font-size: 12px; }
.signature-document summary { cursor: pointer; font-weight: 600; font-size: 15px; padding: 14px 0; border-top: 1px solid #e5e9ef; }
.signature-history { border-top: 1px solid #e5e9ef; padding-top: 24px; }
.signature-history ol { list-style: none; padding: 0; margin: 0; }
.signature-history li { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: 16px; padding: 12px 0; border-bottom: 1px solid #eef1f4; font-size: 13px; }
.signature-history time { color: #667085; }
@media (max-width: 600px) {
    .page-shell.page-shell--workbench { padding: 16px 12px 28px; }
    .signature-history li { grid-template-columns: 1fr; gap: 6px; }
    .signature-parties { flex-direction: column; align-items: flex-start; }
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
    background: #f8fafc;
    border: 1px solid #dbe5f0;
    border-left: 4px solid #2563eb;
    border-radius: 8px;
    padding: 1rem 1.2rem;
    margin-bottom: 1.5rem;
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

.contract-status-chip--pending_party_a,
.contract-status-chip--pending_party_b {
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
}
</style>
