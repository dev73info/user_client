export { communityComments } from './state-seed-comments'
export { communityPosts, communityTags } from './state-seed-posts'

function seededReactions(counts: Array<[number, number]>): Map<number, Set<string>> {
  return new Map(
    counts.map(([id, count]) => [
      id,
      new Set(Array.from({ length: count }, (_, index) => `mock_reader_${index + 1}`)),
    ]),
  )
}

export const communityPostLikes = seededReactions([
  [2, 12],
  [3, 9],
  [4, 6],
  [5, 8],
  [6, 4],
  [7, 7],
  [8, 15],
  [9, 5],
  [10, 11],
  [11, 3],
])
export const communityFavorites = new Map<number, Set<string>>()
export const communityCommentLikes = seededReactions([
  [1, 4],
  [2, 1],
  [3, 2],
  [4, 3],
  [5, 2],
  [6, 1],
  [7, 4],
  [8, 2],
  [9, 5],
  [10, 7],
  [11, 3],
  [12, 6],
  [13, 2],
  [14, 1],
  [15, 5],
  [16, 2],
  [17, 8],
  [18, 3],
  [19, 4],
  [20, 6],
  [21, 9],
])
