import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, expect, it, vi } from 'vitest'
import { HttpError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { installDevRouteGuard } from '@/router/dev'

const mocks = vi.hoisted(() => ({
  requestDevRole: vi.fn(),
  getDevAccessStatus: vi.fn(),
  refreshToken: vi.fn(),
  getPrivileges: vi.fn(),
}))
vi.mock('@/api/auth', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/api/auth')>(),
  requestDevRole: mocks.requestDevRole,
  getDevAccessStatus: mocks.getDevAccessStatus,
  refreshToken: mocks.refreshToken,
  getPrivileges: mocks.getPrivileges,
}))

/** 生效权限（契约 `PrivilegesResponse`）：`is_dev` 的口径就是权限里有 `scope.dev.access`。 */
function privileges(overrides: Partial<{ permissions: string[]; is_super_admin: boolean }> = {}) {
  const permissions = overrides.permissions ?? []
  return {
    username: 'developer',
    role: permissions.includes('scope.dev.access') ? 'dev' : 'user',
    roles: ['user'],
    permissions,
    is_super_admin: overrides.is_super_admin ?? false,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.requestDevRole.mockReset()
  mocks.getDevAccessStatus.mockReset()
  mocks.refreshToken.mockReset()
  mocks.getPrivileges.mockReset()
  // store 拉完令牌就会去取生效权限（`GET /auth/users/privileges`）：默认「是开发者」
  mocks.getPrivileges.mockResolvedValue(privileges({ permissions: ['scope.dev.access'] }))
})

function developer() {
  const auth = useAuthStore()
  auth.token = 'test-token'
  auth.role = 'dev'
  auth.profileLoaded = true
  vi.spyOn(auth, 'hydrate').mockImplementation(() => {})
  return auth
}

function signedStatus(overrides: Partial<Awaited<ReturnType<typeof mocks.getDevAccessStatus>>> = {}) {
  return {
    is_dev: true,
    is_super_admin: false,
    realname_approved: true,
    is_adult: true,
    developer_agreement_signed: true,
    ...overrides,
  }
}

it('accepts a signed developer without requesting the role again', async () => {
  const auth = developer()
  mocks.getDevAccessStatus.mockResolvedValue(signedStatus())
  expect(await auth.ensureDevAccess()).toBe(true)
  expect(mocks.getDevAccessStatus).toHaveBeenCalledWith('test-token')
  expect(mocks.requestDevRole).not.toHaveBeenCalled()
  expect(auth.developerAgreementSigned).toBe(true)
})

it('lets an unsigned developer into the workbench and records the unsigned state', async () => {
  const auth = developer()
  mocks.getDevAccessStatus.mockResolvedValue(signedStatus({ developer_agreement_signed: false }))
  expect(await auth.ensureDevAccess()).toBe(true)
  expect(auth.developerAgreementSigned).toBe(false)
  expect(mocks.requestDevRole).not.toHaveBeenCalled()
})

it('applies for the dev role when the user is not yet a developer', async () => {
  const auth = developer()
  auth.role = 'user'
  mocks.getDevAccessStatus.mockResolvedValue(signedStatus({ is_dev: false }))
  mocks.requestDevRole.mockResolvedValue({ username: 'developer', role: 'dev' })
  mocks.refreshToken.mockResolvedValue({ token: 'new-token', username: 'developer', role: 'dev' })
  expect(await auth.ensureDevAccess()).toBe(true)
  expect(mocks.requestDevRole).toHaveBeenCalledWith('test-token')
})

it('denies access when the role application is blocked by realname or age', async () => {
  const auth = developer()
  auth.role = 'user'
  mocks.getDevAccessStatus.mockResolvedValue(signedStatus({ is_dev: false }))
  mocks.requestDevRole.mockRejectedValue(new HttpError(403, '请先完成实名认证'))
  expect(await auth.ensureDevAccess()).toBe(false)
  expect(auth.devAccessError).toBe('请先完成实名认证')
})

it('does not allow access or clear the session when the role request fails', async () => {
  const auth = developer()
  mocks.getDevAccessStatus.mockResolvedValue(signedStatus({ is_dev: false }))
  mocks.requestDevRole.mockRejectedValue(new Error('offline'))
  await expect(auth.ensureDevAccess()).rejects.toThrow('offline')
  expect(auth.token).toBe('test-token')
  expect(auth.devAccessError).toBe('offline')
})

it('preserves the super administrator exemption', async () => {
  const auth = developer()
  // 超管豁免看的是 `GET /auth/users/privileges` 的 `is_super_admin`（生效权限），不是角色名
  mocks.getPrivileges.mockResolvedValue(privileges({ is_super_admin: true }))
  expect(await auth.ensureDevAccess()).toBe(true)
  expect(mocks.getDevAccessStatus).not.toHaveBeenCalled()
  expect(mocks.requestDevRole).not.toHaveBeenCalled()
})

it('lets an unsigned developer enter dev pages without redirecting to signing', async () => {
  const auth = developer()
  const component = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component },
      { path: '/dev/test', component, meta: { requiresDevAccess: true } },
      { path: '/contract/sign', name: 'contract-sign', component },
      { path: '/dev/no-access', name: 'dev-no-access', component },
    ],
  })
  installDevRouteGuard(router)
  mocks.getDevAccessStatus.mockResolvedValue(signedStatus({ developer_agreement_signed: false }))
  await router.push('/dev/test?source=wallet')
  expect(router.currentRoute.value.path).toBe('/dev/test')
  expect(mocks.requestDevRole).not.toHaveBeenCalled()
})

it('redirects non-developers blocked by realname to the no-access page', async () => {
  const auth = developer()
  auth.role = 'user'
  const component = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component },
      { path: '/dev/test', component, meta: { requiresDevAccess: true } },
      { path: '/dev/no-access', name: 'dev-no-access', component },
    ],
  })
  installDevRouteGuard(router)
  mocks.getDevAccessStatus.mockResolvedValue(signedStatus({ is_dev: false }))
  mocks.requestDevRole.mockRejectedValue(new HttpError(403, '请先完成实名认证'))
  await router.push('/dev/test')
  expect(router.currentRoute.value.name).toBe('dev-no-access')
})
