import { describe, expect, it } from 'vitest'

import {
  RANK_LIMIT,
  buildDeveloperRanks,
  buildTeamRanks,
  countContribResources,
  type PortalRankResource,
} from '@/shared/home/portalRanks'

/**
 * 首页侧栏两张榜单的聚合纯函数（R047 从 `views/HomeView.vue` 下沉）。
 *
 * 这个视图没有组件级回归网，榜单的排序、并列时的兜底次序、前 4 名截断、
 * 「先到先得」的字段合并都压在这里；同时钉住「资源从入参进来」这个约定——
 * 函数签名里没有请求，就不会出现第二份数据源。
 */

/** 本地时间 → ISO 再解析回来，避免不同时区下算出不同顺序。 */
function localIso(day: number, hour: number) {
  return new Date(2026, 2, day, hour, 0).toISOString()
}

function resource(overrides: Partial<PortalRankResource> = {}): PortalRankResource {
  return {
    creator: 'alice',
    author: '',
    creator_avatar_url: null,
    creator_credit_score: null,
    creator_username_gradient: false,
    creator_username_color: null,
    updated_at: localIso(1, 10),
    team_id: null,
    team_name: null,
    team_avatar_url: null,
    ...overrides,
  }
}

describe('buildDeveloperRanks', () => {
  it('空列表给空榜', () => {
    expect(buildDeveloperRanks([])).toEqual([])
  })

  it('按用户名聚合资源数，先按资源数降序', () => {
    const ranks = buildDeveloperRanks([
      resource({ creator: 'alice', updated_at: localIso(1, 10) }),
      resource({ creator: 'bob', updated_at: localIso(2, 10) }),
      resource({ creator: 'bob', updated_at: localIso(3, 10) }),
    ])

    expect(ranks.map((rank) => [rank.username, rank.resourceCount])).toEqual([
      ['bob', 2],
      ['alice', 1],
    ])
  })

  it('资源数并列时按最近更新时间降序，再按用户名中文序兜底', () => {
    const ranks = buildDeveloperRanks([
      resource({ creator: 'aaa', updated_at: localIso(1, 10) }),
      resource({ creator: 'bbb', updated_at: localIso(5, 10) }),
      resource({ creator: 'ccc', updated_at: localIso(1, 10) }),
    ])

    // bbb 更新时间最新排第一；aaa 与 ccc 时间相同，落到 localeCompare
    expect(ranks.map((rank) => rank.username)).toEqual(['bbb', 'aaa', 'ccc'])
  })

  it('时间无法解析的资源按 0 参与排序，不会把整份榜单打乱', () => {
    const ranks = buildDeveloperRanks([
      resource({ creator: 'broken', updated_at: '不是时间' }),
      resource({ creator: 'fresh', updated_at: localIso(9, 10) }),
    ])

    expect(ranks.map((rank) => rank.username)).toEqual(['fresh', 'broken'])
  })

  it(`只留前 ${RANK_LIMIT} 名`, () => {
    const ranks = buildDeveloperRanks([
      ...Array.from({ length: 6 }, (_, index) =>
        resource({ creator: `dev${index}`, updated_at: localIso(index + 1, 10) }),
      ),
    ])

    expect(ranks).toHaveLength(RANK_LIMIT)
    expect(ranks.map((rank) => rank.username)).toEqual(['dev5', 'dev4', 'dev3', 'dev2'])
  })

  it('展示名优先级 creator → author → 「匿名开发者」', () => {
    const [fromCreator] = buildDeveloperRanks([resource({ creator: 'alice', author: 'Alice作者' })])
    expect(fromCreator?.name).toBe('alice')

    const [fromAuthor] = buildDeveloperRanks([resource({ creator: '', author: '  只填了作者  ' })])
    expect(fromAuthor?.name).toBe('只填了作者')

    const [anonymous] = buildDeveloperRanks([resource({ creator: '   ', author: '   ' })])
    expect(anonymous?.name).toBe('匿名开发者')
    expect(anonymous?.username).toBe('')
  })

  it('没有 creator 的资源共用空用户名，聚合成一行', () => {
    const ranks = buildDeveloperRanks([
      resource({ creator: '', author: '甲' }),
      resource({ creator: '   ', author: '乙' }),
    ])

    expect(ranks).toHaveLength(1)
    expect(ranks[0]).toMatchObject({ username: '', name: '甲', resourceCount: 2 })
  })

  it('同一开发者的头像 / 信用分 / 渐变 / 用户名色按先到先得合并', () => {
    const ranks = buildDeveloperRanks(
      [
        resource({ creator: 'alice', creator_credit_score: null }),
        resource({
          creator: 'alice',
          creator_avatar_url: '/uploads/a.png',
          creator_credit_score: 88,
          creator_username_gradient: true,
          creator_username_color: 'tomato',
        }),
        resource({
          creator: 'alice',
          creator_avatar_url: '/uploads/b.png',
          creator_credit_score: 99,
          creator_username_color: 'skyblue',
        }),
      ],
      { resolveAvatarUrl: (raw) => (raw ? `https://api.test${raw}` : '') },
    )

    expect(ranks[0]).toMatchObject({
      username: 'alice',
      resourceCount: 3,
      avatarUrl: 'https://api.test/uploads/a.png',
      creditScore: 88,
      gradient: true,
      userColor: 'tomato',
    })
  })

  it('头像解析器缺省时原样返回，空值给空串（模板据此回落首字母）', () => {
    const [withAvatar, withoutAvatar] = buildDeveloperRanks([
      resource({ creator: 'alice', creator_avatar_url: '/uploads/a.png' }),
      resource({ creator: 'bob', creator_avatar_url: null }),
    ])

    expect(withAvatar?.avatarUrl).toBe('/uploads/a.png')
    expect(withoutAvatar?.avatarUrl).toBe('')
  })
})

describe('countContribResources', () => {
  it('只累加入榜开发者，第 5 名之后不计', () => {
    const resources = Array.from({ length: 5 }, (_, index) => {
      const creator = `dev${index}`
      // dev0 有 5 个资源（稳进榜），其余各 1 个，最后按时间决定谁掉出前 4
      return Array.from({ length: index === 0 ? 5 : 1 }, () =>
        resource({ creator, updated_at: localIso(index + 1, 10) }),
      )
    }).flat()

    const ranks = buildDeveloperRanks(resources)
    expect(ranks).toHaveLength(RANK_LIMIT)
    expect(countContribResources(ranks)).toBe(8)
  })

  it('空榜给 0', () => {
    expect(countContribResources([])).toBe(0)
  })
})

describe('buildTeamRanks', () => {
  it('没有团队归属的资源不计入', () => {
    const ranks = buildTeamRanks([
      resource({ team_id: null, team_name: null }),
      resource({ team_id: 3, team_name: '柒叁小队' }),
    ])

    expect(ranks).toEqual([{ teamId: 3, teamName: '柒叁小队', avatarUrl: '', resourceCount: 1 }])
  })

  it('team_name 为空的资源跳过', () => {
    expect(buildTeamRanks([resource({ team_id: 7, team_name: '' })])).toEqual([])
  })

  it('按团队资源数降序，只留前 4', () => {
    const ranks = buildTeamRanks([
      resource({ team_id: 1, team_name: 'A', updated_at: localIso(1, 10) }),
      resource({ team_id: 2, team_name: 'B', updated_at: localIso(2, 10) }),
      resource({ team_id: 2, team_name: 'B', updated_at: localIso(3, 10) }),
      resource({ team_id: 2, team_name: 'B', updated_at: localIso(4, 10) }),
      ...[3, 4, 5].map((teamId) =>
        resource({ team_id: teamId, team_name: `T${teamId}`, updated_at: localIso(5, 10) }),
      ),
    ])

    expect(ranks.map((rank) => [rank.teamName, rank.resourceCount])).toEqual([
      ['B', 3],
      ['A', 1],
      ['T3', 1],
      ['T4', 1],
    ])
  })

  it('团队头像按先到先得合并，并过一遍注入的解析器', () => {
    const ranks = buildTeamRanks(
      [
        resource({ team_id: 9, team_name: '柒叁小队', team_avatar_url: null }),
        resource({ team_id: 9, team_name: '柒叁小队', team_avatar_url: '/uploads/team.png' }),
      ],
      { resolveAvatarUrl: (raw) => (raw ? `https://api.test${raw}` : '') },
    )

    expect(ranks[0]).toMatchObject({
      teamId: 9,
      resourceCount: 2,
      avatarUrl: 'https://api.test/uploads/team.png',
    })
  })
})
