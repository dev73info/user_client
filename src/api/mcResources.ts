import { requestJson } from '@/api/http'

export type McResourcePlatform = 'java' | 'bedrock'

export type McResourceTagSelectionPayload = {
  group_id: number
  group_name: string
  group_path: string[]
  tag_ids: number[]
  tag_names: string[]
}

export type PublicMcResourceItem = {
  id: number
  creator: string
  requirement_id: string | null
  platform: McResourcePlatform
  title: string
  author: string
  description: string
  tag_selections: McResourceTagSelectionPayload[]
  file_name: string
  source_url: string
  cover_url: string | null
  docs_url: string | null
  visibility: 'draft' | 'review' | 'published'
  release_note: string | null
  created_at: string
  updated_at: string
}

export async function listPublicMcResources(
  platform: McResourcePlatform,
): Promise<PublicMcResourceItem[]> {
  return requestJson<PublicMcResourceItem[]>(
    `/mc-resources/resources?platform=${encodeURIComponent(platform)}`,
    {
      method: 'GET',
    },
    '加载资源列表失败',
  )
}

export async function getPublicMcResource(resourceId: number): Promise<PublicMcResourceItem> {
  return requestJson<PublicMcResourceItem>(
    `/mc-resources/resources/${resourceId}`,
    {
      method: 'GET',
    },
    '加载资源主页失败',
  )
}
