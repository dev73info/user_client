import type { PublicMcResourceItem } from '@/api/resources'

/**
 * 开发者公开主页（`/user/:username/profile`）的挂载烟测夹具。
 *
 * 从 `devProfileView.spec.ts` 拆出（该文件已到 300 行的结构上限）：
 * 这里只放**与 mock 注册无关**的纯数据与查询助手，`vi.mock` 与断言仍留在 spec 里。
 */

/** 契约 `PublicProfileResponse` 的展示字段，外加 1.x 遗留的渐变 / 打赏块。 */
export const profile = {
  username: 'dev_alice',
  profile_description: '做模组的小团队',
  avatar_url: '/uploads/avatar.png',
  home_background_static: '/uploads/bg.png',
  home_background_dynamic: null,
  home_background_static_focus: '{"scale":1.5,"x":-10,"y":5}',
  home_background_dynamic_focus: null,
  username_gradient: true,
  username_color: '',
  tip: {
    enabled: true,
    public_records: true,
    received_cash_fen: 1234,
    received_points: 56,
    recent_messages: [
      { tipper_display: '小明', message: '加油', anonymous: false, created_at: '2026-10-01 10:00' },
    ],
  },
}

export const resource = (overrides: Partial<PublicMcResourceItem>): PublicMcResourceItem => ({
  id: 1,
  creator: 'dev_alice',
  requirement_id: null,
  platform: 'java',
  title: '资源',
  author: 'dev_alice',
  description: '简介',
  tag_selections: [],
  file_name: 'a.jar',
  source_url: '',
  cover_url: null,
  docs_url: null,
  visibility: 'published',
  release_note: null,
  created_at: '2026-09-01 10:00',
  updated_at: '2026-09-01 10:00',
  like_count: 0,
  download_count: 0,
  view_count: 0,
  liked_by_me: false,
  ownership_type: 'personal',
  team_id: null,
  team_name: null,
  origin_type: 'original',
  origin_author: null,
  origin_url: null,
  origin_org: null,
  origin_note: null,
  buyout_price_fen: 0,
  price_fen: 0,
  price_points: 0,
  copyright_declared: true,
  purchased_by_me: false,
  ...overrides,
})

export const resources = [
  resource({
    id: 11,
    title: '匠魂增强',
    platform: 'java',
    like_count: 5,
    cover_url: '/uploads/r11.png',
  }),
  resource({ id: 12, title: '基岩版材质包', platform: 'bedrock', like_count: 7 }),
  resource({ id: 13, creator: 'dev_bob', title: '别人的作品', like_count: 99 }),
]

/** 在指定根节点里按可见文案找按钮 */
export function buttonByText(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === text,
  ) as HTMLButtonElement | undefined
}
