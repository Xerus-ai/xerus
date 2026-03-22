import type { OfficeAgent } from '@/hooks/useOfficeData'

export interface Position {
  x: number // percentage 0-100
  y: number // percentage 0-100
}

export type OfficeZone = 'desk' | 'idle' | 'coffee-shop' | 'printer'

export interface AgentNodeState {
  agent: OfficeAgent
  position: Position
  previousPosition: Position | null
  zone: OfficeZone
}

export interface FlyingTaskData {
  id: string
  from: Position
  to: Position
  taskTitle: string
  type: 'dispatch' | 'return'
}

export type FurnitureLayer = 'floor' | 'desk' | 'wall'

export interface FurnitureItem {
  id: string
  type: 'desk' | 'inbox-desk' | 'plant' | 'whiteboard' | 'rug' | 'cabinet' | 'printer'
  position: Position
  width: number  // percentage
  height: number // percentage
  layer: FurnitureLayer
}

export interface StatusTransition {
  agentId: string
  from: OfficeAgent['status']
  to: OfficeAgent['status']
  taskTitle?: string
}
