import { DEV_USERNAME } from './shared'

/**
 * 公开主页 / 贡献榜里其他开发者佩戴的徽章。
 * 与当前身份无关，保证贡献榜每一行都有稳定演示数据。
 */
export const publicOwned: Record<string, { code: string; equipped: boolean }[]> = {
  [DEV_USERNAME]: [
    { code: 'five_star_dev', equipped: true },
    { code: 'community_helper', equipped: false },
  ],
  mochi_dev: [
    { code: 'community_helper', equipped: true },
    { code: 'first_requirement', equipped: false },
  ],
  toolsmith_demo: [
    { code: 'early_bird', equipped: true },
    { code: 'five_star_dev', equipped: true },
  ],
  zhang_demo: [{ code: 'first_requirement', equipped: true }],
  lin_demo: [{ code: 'community_helper', equipped: true }],
  chen_demo: [{ code: 'early_bird', equipped: true }],
}
