<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
    fetchMyRequirementContract,
    signContract,
    type ContractDetail,
    type SigningLogItem,
} from '@/api/contracts'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const requirementId = String(route.query.requirement_id ?? '')

const loading = ref(true)
const signing = ref(false)
const contract = ref<ContractDetail | null>(null)
const error = ref('')
const successMsg = ref('')
const accepted = ref(false)
const signatureCanvas = ref<HTMLCanvasElement | null>(null)
const signatureTouched = ref(false)

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
    signatureSha256: string | null
    signatureImage: string
}

let drawingSignature = false

const signingLogs = computed(() => contract.value?.signing_logs ?? [])
const currentParty = computed<'party_a' | 'party_b' | null>(() => {
    if (!contract.value || !auth.username) return null
    if (contract.value.party_a_username === auth.username) return 'party_a'
    if (contract.value.party_b_username === auth.username) return 'party_b'
    return null
})
const canSignContract = computed(() => {
    if (!contract.value) return false
    return (
        (contract.value.status === 'pending_party_a' && currentParty.value === 'party_a') ||
        (contract.value.status === 'pending_party_b' && currentParty.value === 'party_b')
    )
})
const waitingMessage = computed(() => {
    if (!contract.value || contract.value.status === 'signed') return ''
    if (contract.value.status === 'pending_party_b') return '等待乙方开发者签署合同'
    if (contract.value.status === 'pending_party_a') return '等待甲方需求方签署合同'
    return ''
})
const partyCards = computed(() => {
    const cards = [partyDisplay('party_a'), partyDisplay('party_b')]
    return cards.filter((item): item is PartyDisplay => item !== null)
})
const currentSigner = computed(() => (currentParty.value ? partyDisplay(currentParty.value) : null))
const signerIdentityReady = computed(() => {
    const signer = currentSigner.value
    return Boolean(signer?.legalName && signer?.idCardNo && signer.idCardNo !== '未完成实名认证')
})
const canSubmitSign = computed(
    () => canSignContract.value && accepted.value && signatureTouched.value && signerIdentityReady.value && !signing.value,
)

function displayText(value: string | null | undefined, fallback: string): string {
    const text = value?.trim()
    return text ? text : fallback
}

function safeSignatureSrc(value?: string | null): string {
    const text = value?.trim() ?? ''
    return /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(text) ? text : ''
}

function partySigningLog(party: ContractParty): SigningLogItem | null {
    const signedAction = party === 'party_a' ? 'party_a_signed' : 'party_b_signed'
    return signingLogs.value.find((log) => log.signer_party === party || log.action === signedAction) ?? null
}

function partyDisplay(party: ContractParty): PartyDisplay | null {
    const item = contract.value
    if (!item) return null
    const log = partySigningLog(party)

    if (party === 'party_a') {
        return {
            party,
            label: '甲方',
            role: '需求方',
            legalName: displayText(item.party_a_real_name ?? item.party_a_name, '未完成实名认证'),
            idCardNo: displayText(item.party_a_id_card_no_masked, '未完成实名认证'),
            username: displayText(item.party_a_username, '未绑定账号'),
            email: displayText(item.party_a_account_email, '未绑定邮箱'),
            signedAt: item.party_a_signed_at,
            signatureSha256: log?.signature_sha256 ?? item.party_a_signature_sha256 ?? null,
            signatureImage: safeSignatureSrc(log?.handwritten_signature),
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
        signatureSha256: log?.signature_sha256 ?? item.party_b_signature_sha256 ?? null,
        signatureImage: safeSignatureSrc(log?.handwritten_signature),
    }
}

function prepareSignatureContext(ctx: CanvasRenderingContext2D) {
    ctx.lineWidth = 2.8
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111827'
}

function setupSignatureCanvas(clear = false) {
    const canvas = signatureCanvas.value
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const width = Math.max(280, Math.floor(rect.width || canvas.clientWidth || 640))
    const height = 180
    const dpr = window.devicePixelRatio || 1
    const nextWidth = Math.floor(width * dpr)
    const nextHeight = Math.floor(height * dpr)

    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth
        canvas.height = nextHeight
        canvas.style.height = `${height}px`
        clear = true
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    prepareSignatureContext(ctx)
    if (clear) {
        ctx.clearRect(0, 0, width, height)
    }
}

function resetSignaturePad() {
    drawingSignature = false
    signatureTouched.value = false
    setupSignatureCanvas(true)
}

function signaturePoint(event: PointerEvent) {
    const canvas = signatureCanvas.value
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
    }
}

function beginSignature(event: PointerEvent) {
    if (!canSignContract.value) return
    setupSignatureCanvas(false)
    const canvas = signatureCanvas.value
    const point = signaturePoint(event)
    const ctx = canvas?.getContext('2d')
    if (!canvas || !point || !ctx) return

    event.preventDefault()
    drawingSignature = true
    signatureTouched.value = true
    canvas.setPointerCapture(event.pointerId)
    prepareSignatureContext(ctx)
    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
    ctx.lineTo(point.x + 0.01, point.y + 0.01)
    ctx.stroke()
}

function drawSignature(event: PointerEvent) {
    if (!drawingSignature) return
    const point = signaturePoint(event)
    const ctx = signatureCanvas.value?.getContext('2d')
    if (!point || !ctx) return

    event.preventDefault()
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
}

function endSignature(event: PointerEvent) {
    if (!drawingSignature) return
    drawingSignature = false
    const canvas = signatureCanvas.value
    if (canvas?.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId)
    }
}

function handleResize() {
    if (!signatureTouched.value) {
        setupSignatureCanvas(true)
    }
}

function actionLabel(action: string): string {
    const labels: Record<string, string> = {
        created: '创建合同',
        updated: '更新合同',
        deleted: '删除合同',
        auto_created: '系统生成',
        party_a_signed: '甲方签署',
        party_b_signed: '乙方签署',
    }
    return labels[action] ?? action
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
        contract.value = await fetchMyRequirementContract(auth.token, requirementId)
        accepted.value = false
        await nextTick()
        resetSignaturePad()
    } catch {
        error.value = '加载合同失败，请刷新重试'
    } finally {
        loading.value = false
    }
}

async function handleSign() {
    if (!contract.value || signing.value) return
    if (!accepted.value) {
        error.value = '请先确认已阅读并同意合同内容'
        return
    }
    if (!signerIdentityReady.value) {
        error.value = '请先完成实名认证，签署身份必须包含真实姓名和身份证号'
        return
    }
    if (!signatureTouched.value || !signatureCanvas.value) {
        error.value = '请先完成手写签名'
        return
    }
    signing.value = true
    error.value = ''
    try {
        const handwrittenSignature = signatureCanvas.value.toDataURL('image/png')
        contract.value = await signContract(auth.token, contract.value.id, {
            handwritten_signature: handwrittenSignature,
        })
        successMsg.value = '合同已签署成功！'
        accepted.value = false
        await nextTick()
        resetSignaturePad()
    } catch (err) {
        error.value = err instanceof Error ? err.message : '签署失败，请稍后重试'
    } finally {
        signing.value = false
    }
}

function goHome() {
    if (route.query.from === 'dev') {
        router.push({ name: 'dev-my-requirements' })
        return
    }
    router.push({ name: 'workbench-requirements' })
}

onMounted(async () => {
    window.addEventListener('resize', handleResize)
    auth.hydrate()
    if (!requirementId) {
        router.replace('/')
        return
    }
    if (auth.token) {
        await auth.initializeSession().catch(() => undefined)
    }
    void loadContract()
})

onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize)
})
</script>

<template>
    <main class="page-shell">
        <section class="panel">
            <header class="panel-head">
                <div>
                    <h2>需求服务合同</h2>
                    <p class="lead">请核对实名认证身份、合同正文与签署证据后完成签署。</p>
                </div>
            </header>

            <div v-if="loading" class="status-msg">加载中…</div>

            <div v-else-if="!contract" class="status-msg">
                <p>暂无可签署的合同，可能合同尚在生成中，请稍后刷新页面。</p>
                <button class="btn-secondary" @click="goHome">返回首页</button>
            </div>

            <template v-else>
                <div class="contract-meta">
                    <p><strong>合同编号：</strong>{{ contract.contract_no }}</p>
                    <p><strong>合同标题：</strong>{{ contract.title }}</p>
                    <p><strong>签署状态：</strong><span class="contract-status-chip"
                            :class="`contract-status-chip--${contract.status}`">{{ statusLabel(contract.status)
                            }}</span></p>
                    <p><strong>合同指纹：</strong><span class="hash-text">{{ contract.content_sha256 }}</span></p>
                </div>

                <section class="party-grid" aria-label="合同当事人">
                    <article v-for="party in partyCards" :key="party.party" class="party-card"
                        :class="{ 'party-card--current': currentParty === party.party }">
                        <div class="party-card__head">
                            <span>{{ party.label }}</span>
                            <strong>{{ party.role }}</strong>
                        </div>
                        <dl class="party-fields">
                            <div>
                                <dt>实名姓名</dt>
                                <dd>{{ party.legalName }}</dd>
                            </div>
                            <div>
                                <dt>身份证号</dt>
                                <dd>{{ party.idCardNo }}</dd>
                            </div>
                            <div>
                                <dt>平台账户</dt>
                                <dd>{{ party.username }} / {{ party.email }}</dd>
                            </div>
                            <div>
                                <dt>签署时间</dt>
                                <dd>{{ party.signedAt ?? '待签署' }}</dd>
                            </div>
                            <div v-if="party.signatureSha256">
                                <dt>手写签名指纹</dt>
                                <dd class="hash-text hash-text--compact">{{ party.signatureSha256 }}</dd>
                            </div>
                            <div v-if="party.signatureImage">
                                <dt>手写签名</dt>
                                <dd><img class="signature-preview" :src="party.signatureImage" alt="手写签名" /></dd>
                            </div>
                        </dl>
                    </article>
                </section>

                <section class="contract-content">{{ contract.content }}</section>

                <section class="evidence-panel">
                    <h3>签署证据摘要</h3>
                    <p>本页记录实名认证姓名、身份证号、平台账户、手写签名指纹、签署时间、合同内容指纹与状态流转。</p>
                    <div v-if="signingLogs.length > 0" class="log-list">
                        <div v-for="log in signingLogs" :key="log.id" class="log-item">
                            <div>
                                <strong>{{ actionLabel(log.action) }}</strong>
                                <span>{{ log.created_at }}</span>
                            </div>
                            <p>操作账号：{{ log.operator }}</p>
                            <p v-if="log.signer_real_name">实名签署：{{ log.signer_real_name }}（{{
                                log.signer_id_card_no_masked }}）</p>
                            <p v-if="log.signer_username">平台账户：{{ log.signer_username }} / {{ log.signer_email ??
                                '未绑定邮箱' }}</p>
                            <p v-if="log.signature_sha256">手写签名指纹：<span class="hash-inline">{{ log.signature_sha256
                            }}</span></p>
                            <img v-if="safeSignatureSrc(log.handwritten_signature)" class="log-signature-preview"
                                :src="safeSignatureSrc(log.handwritten_signature)" alt="手写签名" />
                            <p v-if="log.note">{{ log.note }}</p>
                        </div>
                    </div>
                    <p v-else class="empty-log">暂无签署日志。</p>
                </section>

                <div v-if="successMsg" class="msg-success">{{ successMsg }}</div>
                <div v-if="error" class="msg-error">{{ error }}</div>

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
                        <p v-if="!signerIdentityReady" class="identity-warning">实名认证审核通过后才能签署合同。</p>
                    </div>

                    <div class="signature-box">
                        <div class="signature-box__head">
                            <h3>手写签名</h3>
                            <button type="button" class="btn-text" @click="resetSignaturePad">清空</button>
                        </div>
                        <canvas ref="signatureCanvas" class="signature-canvas" aria-label="手写签名区域"
                            @pointerdown="beginSignature" @pointermove="drawSignature" @pointerup="endSignature"
                            @pointercancel="endSignature" @pointerleave="endSignature"></canvas>
                    </div>

                    <label class="accept-row">
                        <input v-model="accepted" type="checkbox" />
                        <span>我已完整阅读合同正文，确认以以上实名认证姓名、身份证号和手写签名签署，并同意系统保存本次签署记录作为履约证据。</span>
                    </label>
                </section>

                <div class="contract-actions">
                    <button v-if="canSignContract" class="btn-primary" :disabled="!canSubmitSign" @click="handleSign">
                        {{ signing ? '签署中…' : '确认签署合同' }}
                    </button>
                    <span v-else-if="contract.status === 'signed'" class="badge-signed">已签署</span>
                    <span v-else-if="waitingMessage" class="badge-pending">{{ waitingMessage }}</span>
                    <button class="btn-secondary" @click="goHome">返回首页</button>
                </div>
            </template>
        </section>
    </main>
</template>

<style scoped>
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
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #e8edf4;
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

.party-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
}

.party-card {
    border: 1px solid #d5dde8;
    border-radius: 8px;
    background: #ffffff;
    padding: 1rem;
}

.party-card--current {
    border-color: #f59e0b;
    box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.14);
}

.party-card__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding-bottom: 0.7rem;
    margin-bottom: 0.75rem;
    border-bottom: 1px solid #eef2f7;
}

.party-card__head span {
    color: #f59e0b;
    font-size: 0.92rem;
    font-weight: 800;
}

.party-card__head strong {
    color: #334155;
    font-size: 0.88rem;
}

.party-fields,
.signer-fields {
    display: grid;
    gap: 0.62rem;
    margin: 0;
}

.party-fields div,
.signer-fields div {
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    gap: 0.6rem;
    align-items: baseline;
}

.party-fields dt,
.signer-fields dt {
    color: #64748b;
    font-size: 0.86rem;
}

.party-fields dd,
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

.accept-row {
    display: flex;
    gap: 0.55rem;
    align-items: flex-start;
    margin-bottom: 1.1rem;
    padding: 0.9rem 1rem;
    color: #1f2937;
    font-size: 0.94rem;
    line-height: 1.6;
    border: 1px solid #f59e0b;
    border-radius: 8px;
    background: #fffbeb;
}

.accept-row input {
    width: 18px;
    height: 18px;
    margin-top: 0.25rem;
    flex: 0 0 auto;
    accent-color: #f59e0b;
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
    gap: 1rem;
    align-items: center;
    flex-wrap: wrap;
    padding-top: 1rem;
    border-top: 1px solid #e2e8f0;
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

.badge-signed {
    display: inline-block;
    padding: 0.55rem 1rem;
    background: #ecfdf5;
    color: #047857;
    border: 1px solid #bbf7d0;
    border-radius: 999px;
    font-size: 0.9rem;
    font-weight: 800;
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

    .party-grid {
        grid-template-columns: 1fr;
    }

    .party-fields div,
    .signer-fields div {
        grid-template-columns: 1fr;
        gap: 0.2rem;
    }
}
</style>
