/**
 * 头像更新广播事件。
 *
 * 上传头像的入口在个人主页（`ProfileView`）与账号资料页（`AccountCouponsView`），
 * 而展示头像的顶栏用户胶囊（`PortalTopNav`）是整站常驻的另一个组件，三者没有父子关系。
 * 所以上传成功后广播一个事件，由需要刷新的地方订阅，
 * 与 `shared/conversationEvents.ts`、`shared/api/authEvents.ts` 是同一套做法。
 *
 * 后端每次上传都会落成一个新的 uuid 前缀文件名（`user-avatars/<用户名>/<uuid>-avatar.png`），
 * 所以订阅方重新拉一次 `GET /settings/profile` 就能拿到新地址，不需要额外打散缓存。
 */

export const PROFILE_AVATAR_UPDATED_EVENT = '73info:profile-avatar-updated'

export function dispatchProfileAvatarUpdated() {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new CustomEvent(PROFILE_AVATAR_UPDATED_EVENT))
}
