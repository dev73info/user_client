import type { VueWrapper } from '@vue/test-utils'
import { expect } from 'vitest'
import type {
  McResourcePayload,
  ResourceApiChannelPayload,
  UpdateMcResourceHomepageRequest,
} from '@/api/mcResources'
import type { McProcessedTagTree } from '@/api/resourceTags'

/**
 * 资源主页编辑页两组保存用例（`devResourceHomepageSave` / `devResourceHomepageApiSave`）
 * 共用的夹具与读数工具。
 *
 * 放在这里而不是各自抄一份：两份夹具一旦漂移，同一个后端契约就会被两种口径描述，
 * 「载荷逐字段正确」这句话也就没法信了。
 */

/** 一棵最小标签树：一个根节点、一个二级节点、一组两个标签。 */
export function tagTreeFixture(): McProcessedTagTree {
  return {
    roots: [
      {
        key: 'handdraw',
        label: '美术',
        first_entry_key: 'hand',
        entries: [
          {
            key: 'hand',
            group_name: '手绘',
            platform: '手绘',
            label: '美术 / 手绘',
            path_label: '美术 / 手绘',
            icon: '',
            publish_groups: [
              {
                key: 'g28',
                group_id: 28,
                group_name: '类型',
                group_alias: 'group-16',
                group_path: ['美术', '手绘', '类型'],
                group_path_aliases: ['group-15', 'group-16'],
                label: '美术 / 手绘 / 类型',
                depth: 0,
                items: [
                  { id: 210, name: 'VOCALOID', alias: 'tag-160' },
                  { id: 211, name: '插画', alias: 'tag-161' },
                ],
              },
            ],
          },
        ],
      },
    ],
  }
}

/** 一份「每格都填过」的资源，用来验证回填与载荷都真的带上了值。 */
export function resourceFixture(part: Partial<McResourcePayload> = {}): McResourcePayload {
  return {
    id: 158100,
    creator: 'dev_flow_03562487',
    ownership_type: 'team',
    team_id: 77,
    requirement_id: null,
    platform: '手绘',
    title: '示例资源',
    author: '开发者',
    // 故意写成开发者自己的文案：形如「<分区> · <平台>资源，已选择 N 个标签。」的简介会被当作
    // 自动生成的简介跟着勾选变化（既有行为），那样就测不到「原样提交」了。
    description: '一套手绘笔刷与配套示例工程。',
    tag_selections: [
      {
        group_id: 28,
        group_name: '类型',
        group_path: ['美术', '手绘', '类型'],
        tag_ids: [210],
        tag_names: ['VOCALOID'],
      },
    ],
    file_name: 'example.package',
    source_url: 'pending://resource/手绘/handdraw/example',
    cover_url: '/uploads/cover-158100.png',
    docs_url: 'https://docs.example.com/resource',
    visibility: 'draft',
    release_note: '<p>首发版本</p>',
    origin_type: 'repost',
    origin_author: '原作者',
    origin_url: 'https://origin.example.com/post/1',
    origin_org: '苦力怕论坛',
    origin_note: '已获授权',
    price_fen: 1234,
    price_points: 0,
    copyright_declared: true,
    resource_kind: 'normal',
    promo_share_bps: 1000,
    created_at: '2026-10-18 06:00:00',
    updated_at: '2026-10-18 06:00:00',
    ...part,
  }
}

/** 接口资源已保存的渠道配置（读取时的回显口径：密钥只有掩码）。 */
export function channelFixture(
  part: Partial<ResourceApiChannelPayload> = {},
): ResourceApiChannelPayload {
  return {
    resource_id: 158100,
    resource_kind: 'api',
    repeat_purchasable: false,
    callback_url: 'https://shop.example.com/73info/callback',
    callback_secret_masked: 'sk***ab',
    callback_secret_set: true,
    hidden_from_catalog: true,
    allowed_origins: ['https://shop.example.com'],
    updated_at: '2026-10-18 06:00:00',
    updated_by: 'dev_flow_03562487',
    ...part,
  }
}

export type HomepageEditForm = {
  title: string
  author: string
  description: string
  cover_url: string
  docs_url: string
  release_note: string
  ownershipType: 'individual' | 'team'
  teamId: string
  originType: 'original' | 'repost'
  originAuthor: string
  originUrl: string
  originOrg: string
  originNote: string
  priceYuan: string
  pricePoints: string
  promoSharePercent: number
  copyrightDeclared: boolean
  resourceKind: 'normal' | 'api'
  apiCallbackUrl: string
  apiCallbackSecret: string
  apiAllowedOrigins: string
  apiRepeatPurchasable: boolean
}

/** 视图 `setupState` 里用例要读的那几个入口（拆视图后仍由视图透传）。 */
export type HomepageEditState = {
  form: HomepageEditForm
  saveHomepage: () => Promise<void>
  formState: { selectedCoverFile: { value: File | null } }
}

export function state<T>(wrapper: VueWrapper): T {
  return (wrapper.vm.$ as unknown as { setupState: T }).setupState
}

/** 取出本次 PATCH 主页的载荷（`updateMcResourceHomepage` 的第三个参数）。 */
export function savedPayload(updateHomepage: {
  mock: { calls: unknown[][] }
}): UpdateMcResourceHomepageRequest {
  const call = updateHomepage.mock.calls[0]
  expect(call).toBeTruthy()
  return call?.[2] as UpdateMcResourceHomepageRequest
}
