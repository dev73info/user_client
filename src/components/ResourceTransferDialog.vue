<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import { HttpError } from '@/api/http'
import type { McResourcePayload } from '@/api/mcResources'
import { createResourceTransfer } from '@/api/resourceTransfers'
import { getTeamDetail, listMyTeams, type TeamResponse } from '@/api/team'
import { describeBackendError } from '@/shared/backendErrorText'
import { validateTransferReceiver } from '@/shared/resourceTransfer'
import { useAuthStore } from '@/stores/auth'
import {
  TAlert,
  TButton,
  TDialog,
  TForm,
  TFormItem,
  TInput,
  TMessage,
  TOption,
  TRadio,
  TRadioGroup,
  TSelect,
} from 'ui_73info'

const props = defineProps<{ resource: McResourcePayload | null }>()
const emit = defineEmits<{ submitted: [] }>()
const open = defineModel<boolean>('open', { required: true })
const auth = useAuthStore()
const form = reactive({
  receiverType: 'user' as 'user' | 'team',
  toUser: '',
  toTeamId: null as number | null,
  message: '',
})
const submitting = ref(false)
const manageableTeams = ref<TeamResponse[]>([])
const teamsLoading = ref(false)
const teamsError = ref('')
const dialogTitle = computed(() =>
  props.resource ? `资源过户 · ${props.resource.title}` : '资源过户',
)

watch(open, (visible) => {
  if (!visible) return
  form.receiverType = 'user'
  form.toUser = ''
  form.toTeamId = null
  form.message = ''
  teamsError.value = ''
  void loadManageableTeams()
})

async function loadManageableTeams() {
  if (!auth.token) return
  teamsLoading.value = true
  teamsError.value = ''
  try {
    const teams = await listMyTeams(auth.token)
    const details = await Promise.all(teams.map((team) => getTeamDetail(auth.token, team.team_id)))
    manageableTeams.value = details
      .filter((detail) =>
        detail.members.some(
          (member) =>
            member.username === auth.username &&
            (member.role === 'owner' || member.role === 'admin'),
        ),
      )
      .map((detail) => detail.team)
    if (!manageableTeams.value.length) form.receiverType = 'user'
  } catch (error) {
    manageableTeams.value = []
    teamsError.value = describeBackendError(error, '加载可接收资源的团队失败')
  } finally {
    teamsLoading.value = false
  }
}

async function submit() {
  if (!auth.token) {
    TMessage.error('登录状态已失效，请重新登录')
    return
  }
  if (!props.resource) {
    TMessage.warning('资源信息缺失，请刷新后重试')
    return
  }
  const invalidReason = validateTransferReceiver(form)
  if (invalidReason) {
    TMessage.warning(invalidReason)
    return
  }
  submitting.value = true
  try {
    await createResourceTransfer(auth.token, props.resource.id, {
      to_user: form.receiverType === 'user' ? form.toUser.trim() : null,
      to_team_id: form.receiverType === 'team' ? form.toTeamId : null,
      message: form.message.trim() || null,
    })
    open.value = false
    TMessage.success('过户申请已发出，等待对方接受')
    emit('submitted')
  } catch (error) {
    TMessage.error(describeBackendError(error, '发起资源过户失败'))
    if (error instanceof HttpError && error.status === 409) emit('submitted')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <TDialog v-model:open="open" width="520px" class="dev-dialog" :title="dialogTitle">
    <TAlert tone="warning" variant="soft" title="接收方接受后，资源所有权才会变更。" />
    <TForm label-position="top" class="resource-transfer-form">
      <TFormItem label="接收方" required>
        <TRadioGroup v-model="form.receiverType">
          <TRadio value="user">用户</TRadio>
          <TRadio value="team">我管理的团队</TRadio>
        </TRadioGroup>
      </TFormItem>
      <TFormItem v-if="form.receiverType === 'user'" label="接收方登录用户名" required>
        <TInput v-model="form.toUser" :maxlength="64" placeholder="登录用户名" />
      </TFormItem>
      <TFormItem v-else label="接收团队" required>
        <TSelect
          v-model="form.toTeamId"
          :loading="teamsLoading"
          placeholder="选择团队"
          style="width: 100%"
        >
          <TOption
            v-for="team in manageableTeams"
            :key="team.team_id"
            :value="team.team_id"
            :label="`${team.name}（${team.member_count} 人）`"
          />
        </TSelect>
        <div v-if="teamsError" class="resource-transfer-form__error" role="alert">
          <span>{{ teamsError }}</span>
          <TButton variant="outline" :loading="teamsLoading" @click="loadManageableTeams">
            重试
          </TButton>
        </div>
        <p v-else-if="!teamsLoading && !manageableTeams.length" class="wb-empty" role="status">
          暂无可管理的团队
        </p>
      </TFormItem>
      <TFormItem label="说明">
        <TInput
          v-model="form.message"
          type="textarea"
          :rows="3"
          show-count
          :maxlength="500"
          placeholder="交接事项"
        />
      </TFormItem>
    </TForm>
    <template #footer>
      <TButton :disabled="submitting" @click="open = false">取消</TButton>
      <TButton variant="solid" tone="accent" :loading="submitting" @click="submit">
        发起过户
      </TButton>
    </template>
  </TDialog>
</template>

<style scoped>
.resource-transfer-form {
  margin-top: 16px;
}
.resource-transfer-form__error {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 8px;
  color: var(--73-danger);
}
</style>
