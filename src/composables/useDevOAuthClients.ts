import { reactive, ref } from 'vue'

import {
  createOAuthClient,
  deleteOAuthClient,
  listOAuthClients,
  rotateOAuthClientSecret,
  updateOAuthClient,
  type OAuthClient,
} from '@/api/oauthClients'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

export function useDevOAuthClients() {
  const auth = useAuthStore()
  const loading = ref(false)
  const submitting = ref(false)
  const clients = ref<OAuthClient[]>([])
  const loadError = ref('')

  const createForm = reactive({
    name: '',
    redirectUris: '',
    scopes: ['profile'] as string[],
  })
  const editingId = ref<string | null>(null)
  const editForm = reactive({ name: '', redirectUris: '' })
  const oneTimeSecret = ref<{ clientId: string; secret: string } | null>(null)
  const copied = ref(false)

  function urisOf(text: string): string[] {
    return text
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  async function loadClients() {
    loading.value = true
    loadError.value = ''
    try {
      clients.value = await listOAuthClients(auth.token)
    } catch (error) {
      loadError.value = error instanceof Error ? error.message : '加载接入客户端失败'
    } finally {
      loading.value = false
    }
  }

  function toggleScope(scope: string) {
    const index = createForm.scopes.indexOf(scope)
    if (index >= 0) createForm.scopes.splice(index, 1)
    else createForm.scopes.push(scope)
  }

  async function copySecret() {
    if (!oneTimeSecret.value) return
    try {
      await navigator.clipboard.writeText(oneTimeSecret.value.secret)
      copied.value = true
      setTimeout(() => (copied.value = false), 2000)
    } catch {
      TMessage.warning('复制失败，请手动选中密钥复制')
    }
  }

  async function submitCreate() {
    const name = createForm.name.trim()
    const redirect_uris = urisOf(createForm.redirectUris)
    if (!name) {
      TMessage.warning('请填写应用名称')
      return
    }
    if (!redirect_uris.length) {
      TMessage.warning('请至少填写一个回调地址')
      return
    }
    if (!createForm.scopes.length) {
      TMessage.warning('请至少选择一个权限范围')
      return
    }
    submitting.value = true
    try {
      const created = await createOAuthClient(auth.token, {
        name,
        redirect_uris,
        scopes: createForm.scopes,
      })
      if (created.client_secret) {
        oneTimeSecret.value = { clientId: created.client_id, secret: created.client_secret }
      }
      createForm.name = ''
      createForm.redirectUris = ''
      createForm.scopes = ['profile']
      await loadClients()
      TMessage.success('客户端已创建，请立即保存密钥')
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '创建接入客户端失败')
    } finally {
      submitting.value = false
    }
  }

  function openEdit(client: OAuthClient) {
    editingId.value = client.client_id
    editForm.name = client.name
    editForm.redirectUris = client.redirect_uris.join('\n')
  }

  async function submitEdit(client: OAuthClient) {
    const name = editForm.name.trim()
    const redirect_uris = urisOf(editForm.redirectUris)
    if (!name || !redirect_uris.length) {
      TMessage.warning('应用名称与回调地址都不能为空')
      return
    }
    submitting.value = true
    try {
      await updateOAuthClient(auth.token, client.client_id, { name, redirect_uris })
      editingId.value = null
      await loadClients()
      TMessage.success('已保存')
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      submitting.value = false
    }
  }

  async function rotate(client: OAuthClient) {
    if (!window.confirm(`确定要轮换「${client.name}」的密钥吗？旧密钥会立即失效。`)) return
    submitting.value = true
    try {
      const result = await rotateOAuthClientSecret(auth.token, client.client_id)
      oneTimeSecret.value = { clientId: client.client_id, secret: result.client_secret }
      await loadClients()
      TMessage.success('新密钥已生效，请立即保存')
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '轮换密钥失败')
    } finally {
      submitting.value = false
    }
  }

  async function remove(client: OAuthClient) {
    if (!window.confirm(`确定要删除「${client.name}」吗？删除后使用该客户端的应用会立即失效。`))
      return
    submitting.value = true
    try {
      await deleteOAuthClient(auth.token, client.client_id)
      if (oneTimeSecret.value?.clientId === client.client_id) oneTimeSecret.value = null
      await loadClients()
      TMessage.success('已删除')
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '删除失败')
    } finally {
      submitting.value = false
    }
  }

  function init() {
    auth.hydrate()
    void loadClients()
  }

  return {
    clients,
    copied,
    copySecret,
    createForm,
    editForm,
    editingId,
    init,
    loadClients,
    loadError,
    loading,
    oneTimeSecret,
    openEdit,
    remove,
    rotate,
    submitCreate,
    submitEdit,
    submitting,
    toggleScope,
  }
}
