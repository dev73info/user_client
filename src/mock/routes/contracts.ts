/**
 * 合同：我的合同、按需求取合同、签署、爱签相关占位。
 *
 * 合同状态与需求单状态在 `db.ts` 里是对齐的：合同签完才可能进入「待付定金」。
 * 签署动作会同时更新合同状态与签署日志，签署页刷新后能看到自己那一方的签字时间。
 *
 * 路由与合同/附件的构造函数分在 `contracts/` 下，本文件只按原顺序把它们拼成一张路由表：
 * 路径、note、处理逻辑都没动。
 */

import { defineRouteTable, type MockRoute } from '../router'

import { contractAttachmentRoutes } from './contracts/attachmentRoutes'
import { contractRoutes as contractMainRoutes } from './contracts/contractRoutes'

const routes: MockRoute[] = [...contractMainRoutes, ...contractAttachmentRoutes]

export const contractRoutes = defineRouteTable('contracts', routes)
