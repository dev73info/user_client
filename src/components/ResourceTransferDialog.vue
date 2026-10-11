<script setup lang="ts">
/**
 * 资源过户发起弹窗（R015）
 *
 * 开发者在资源项目列表 / 资源主页编辑页发起过户：接收方二选一（开发者用户名，或我有
 * `owner` / `admin` 角色的团队），另可留一段说明。所有权变更与全部前置校验都在后端，
 * 这里只收集参数、调接口、把后端的中文提示原样透出；成功后 emit `submitted`，
 * 由宿主刷新「我发起的」列表。
 *
 * 「接收团队」只列我担任 `owner` / `admin` 的团队：后端也只认这两种角色能发起 / 接收团队过户，
 * 把仅具 `member` 身份的团队列出来只会让用户提交时才吃到 403。
 */
import { computed, reactive, ref, watch } from 'vue'
import type { McResourcePayload } from '@/api/mcResources'
import { createResourceTransfer } from '@/api/resourceTransfers'
import { getTeamDetail, listMyTeams, type TeamDetailResponse } from '@/api/team'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { describeTransferError, validateTransferReceiver } from '@/shared/resourceTransfer'
import {
  TAlert,
  TButton,
  TDialog,
  TForm,
  TFormItem,
  TInput,
  TOption,
  TRadio,
  TRadioGroup,
  TSelect,
} from 'ui_73info'

const props = defineProps<{
  /** 弹窗开关，配合 `v-model:open` 双向绑定 */
  open: boolean
  /** 要过户的资源；为 null 时不渲染表单内容 */
  resource: McResourcePayload | null
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  /** 发起成功，宿主据此刷新过户列表 */
  (e: 'submitted'): void
}>()

const auth = useAuthStore()
const { showToast } = useToast()

const form = reactive({
  receiverType: 'user' as 'user' | 'team',
  toUser: '',
  toTeamId: null as number | null,
  message: '',
})
const submitting = ref(false)
const manageableTeams = ref<TeamDetailResponse[]>([])
const teamsLoading = ref(false)

const openModel = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
})

const dialogTitle = computed(() =>
  props.resource ? `过户 · ${props.resource.title}` : '资源过户',
)

// 每次打开都从空表单开始，免得上一次的接收方与说明串到这一次。
watch(
  () => props.open,
  (open) => {
    if (!open) {
      return
    }

    form.receiverType = 'user'
    form.toUser = ''
    form.toTeamId = null
    form.message = ''
    void loadManageableTeams()
  },
)

async function loadManageableTeams() {
  if (!auth.token) {
    return
  }

  teamsLoading.value = true
  try {
    const teams = await listMyTeams(auth.token)
    const details = await Promise.all(
      teams.map((team) => getTeamDetail(auth.token, team.team_id).catch(() => null)),
    )
    manageableTeams.value = details.filter(
      (detail): detail is TeamDetailResponse =>
        detail !== null &&
        detail.members.some(
          (member) =>
            member.username === auth.username &&
            (member.role === 'owner' || member.role === 'admin'),
        ),
    )
    if (!manageableTeams.value.length) {
      form.receiverType = 'user'
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载我的团队失败'
    showToast(message, 'warning')
  } finally {
    teamsLoading.value = false
  }
}

async function submit() {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }
  if (!props.resource) {
    showToast('资源信息缺失，请刷新后重试', 'warning')
    return
  }

  const invalidReason = validateTransferReceiver({
    receiverType: form.receiverType,
    toUser: form.toUser,
    toTeamId: form.toTeamId,
  })
  if (invalidReason) {
    showToast(invalidReason, 'warning')
    return
  }

  submitting.value = true
  try {
    await createResourceTransfer(auth.token, props.resource.id, {
      to_user: form.receiverType === 'user' ? form.toUser.trim() : null,
      to_team_id: form.receiverType === 'team' ? form.toTeamId : null,
      message: form.message.trim() || null,
    })
    emit('update:open', false)
    showToast('过户申请已发出，等待对方同意', 'success')
    emit('submitted')
  } catch (error) {
    // 后端已为每种拒绝给了中文说明（如「该资源正被需求绑定，暂不能过户」），原样透出。
    const { message, needRefresh } = describeTransferError(error, '发起过户失败')
    showToast(message, 'error')
    if (needRefresh) {
      emit('submitted')
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <TDialog v-model:open="openModel" width="520px" class="dev-dialog" :title="dialogTitle">
    <TAlert tone="warning" variant="soft">
      过户后资源归接收方所有，需对方同意后才生效；等待期间你可以撤销。已关联活跃需求的资源不能过户。
    </TAlert>

    <TForm label-position="top" class="dev-transfer-form">
      <TFormItem label="接收方" required>
        <TRadioGroup v-model="form.receiverType">
          <TRadio value="user">开发者用户名</TRadio>
          <TRadio value="team">我管理的团队</TRadio>
        </TRadioGroup>
      </TFormItem>

      <TFormItem v-if="form.receiverType === 'user'" label="接收方开发者用户名" required>
        <TInput v-model="form.toUser" :maxlength="64" placeholder="填写接收方的登录用户名" />
      </TFormItem>

      <TFormItem v-else label="接收团队" required>
        <TSelect v-model="form.toTeamId" :loading="teamsLoading" placeholder="选择你作为 owner / admin 的团队"
          style="width: 100%">
          <TOption v-for="team in manageableTeams" :key="team.team_id" :value="team.team_id"
            :label="`${team.name}（${team.members.length} 人）`" />
        </TSelect>
        <p v-if="!teamsLoading && !manageableTeams.length" class="dev-transfer-hint">
          你还没有可管理的团队；团队接收需要你是该团队的 owner / admin。
        </p>
      </TFormItem>

      <TFormItem label="说明">
        <TInput v-model="form.message" type="textarea" :rows="3" show-count :maxlength="500"
          placeholder="可选：向接收方说明过户原因或交接事项" />
      </TFormItem>
    </TForm>

    <template #footer>
      <TButton @click="openModel = false">取消</TButton>
      <TButton variant="solid" tone="accent" :loading="submitting" @click="submit">
        发起过户
      </TButton>
    </template>
  </TDialog>
</template>

<style scoped>
.dev-transfer-form {
  margin-top: 16px;
}

.dev-transfer-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--dev-muted);
  line-height: 1.5;
}
</style>
