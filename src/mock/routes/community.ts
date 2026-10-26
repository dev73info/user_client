import { defineRouteTable, type MockRoute } from '../router'

import { communityReadRoutes } from './community/readRoutes'
import { communityWriteRoutes } from './community/writeRoutes'

const routes: MockRoute[] = [...communityReadRoutes, ...communityWriteRoutes]

export const communityRoutes = defineRouteTable('community', routes)
