import type { FurnitureItem, Position, OfficeZone, AgentNodeState } from './office-types'
import type { OfficeAgent } from '@/hooks/useOfficeData'

// --- Furniture placement (percentage coords in 16:9 canvas) ---

export const FURNITURE: FurnitureItem[] = [
  // Wall items
  { id: 'whiteboard', type: 'whiteboard', position: { x: 72, y: 10 }, width: 14, height: 18, layer: 'wall' },
  { id: 'cabinet',    type: 'cabinet',    position: { x: 58, y: 12 }, width: 8,  height: 16, layer: 'wall' },
  { id: 'printer',    type: 'printer',    position: { x: 88, y: 14 }, width: 7,  height: 12, layer: 'wall' },

  // Floor items
  { id: 'rug',        type: 'rug',        position: { x: 78, y: 68 }, width: 20, height: 22, layer: 'floor' },

  // Desks (drawn on top of agents for depth)
  { id: 'desk-1',     type: 'desk',       position: { x: 12, y: 52 }, width: 14, height: 12, layer: 'desk' },
  { id: 'desk-2',     type: 'desk',       position: { x: 30, y: 52 }, width: 14, height: 12, layer: 'desk' },
  { id: 'desk-3',     type: 'desk',       position: { x: 12, y: 76 }, width: 14, height: 12, layer: 'desk' },
  { id: 'desk-4',     type: 'desk',       position: { x: 30, y: 76 }, width: 14, height: 12, layer: 'desk' },
  { id: 'inbox-desk', type: 'inbox-desk', position: { x: 50, y: 55 }, width: 12, height: 11, layer: 'desk' },

  // Decorative plants
  { id: 'plant-idle', type: 'plant',      position: { x: 50, y: 82 }, width: 5,  height: 10, layer: 'desk' },
  { id: 'plant-cafe', type: 'plant',      position: { x: 70, y: 62 }, width: 4,  height: 8,  layer: 'desk' },
]

// --- Agent slots per zone ---

const DESK_SLOTS: Position[] = [
  // Row 1 seats (near desk-with-pc at y:36, right side)
  { x: 53, y: 30 }, { x: 63, y: 30 },
  { x: 75, y: 30 }, { x: 85, y: 30 },
  // Row 2 seats (near plain desks at y:58)
  { x: 53, y: 52 }, { x: 63, y: 52 },
  { x: 75, y: 52 }, { x: 85, y: 52 },
]

const IDLE_SLOTS: Position[] = [
  // On the rug at bottom-left
  { x: 12, y: 72 }, { x: 20, y: 70 },
  { x: 24, y: 74 }, { x: 28, y: 70 },
  { x: 16, y: 76 }, { x: 32, y: 74 },
]

const COFFEE_SLOTS: Position[] = [
  // Top-left cafe zone (idle agents on coffee break)
  { x: 10, y: 55 }, { x: 20, y: 53 },
  { x: 12, y: 62 }, { x: 24, y: 60 },
  { x: 16, y: 68 }, { x: 28, y: 66 },
]

const ERROR_SLOTS: Position[] = [
  // Near printer on desk
  { x: 80, y: 52 }, { x: 86, y: 50 },
  { x: 78, y: 58 }, { x: 84, y: 56 },
]

const ZONE_SLOTS: Record<OfficeZone, Position[]> = {
  'desk': DESK_SLOTS,
  'idle': IDLE_SLOTS,
  'coffee-shop': COFFEE_SLOTS,
  'printer': ERROR_SLOTS,
}

function statusToZone(status: OfficeAgent['status']): OfficeZone {
  switch (status) {
    case 'active': return 'desk'
    case 'idle': return 'idle'
    case 'sleeping': return 'coffee-shop'
    case 'error': return 'printer'
  }
}

/** Simple hash to get a deterministic index from an agent ID */
function hashToIndex(id: string, max: number): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % max
}

/** Small jitter so agents don't overlap perfectly */
function jitter(seed: string): { dx: number; dy: number } {
  const h = hashToIndex(seed + '_jitter', 100)
  return {
    dx: (h % 5) - 2, // -2 to +2
    dy: ((h >> 3) % 5) - 2,
  }
}

export function assignAgentPosition(agent: OfficeAgent, slotCounters: Map<OfficeZone, number>): { position: Position; zone: OfficeZone } {
  const zone = statusToZone(agent.status)
  const slots = ZONE_SLOTS[zone]
  const counter = slotCounters.get(zone) ?? 0
  slotCounters.set(zone, counter + 1)

  // Use counter first (fill sequentially), hash as tiebreaker for overflow
  const slotIndex = counter < slots.length
    ? counter
    : hashToIndex(agent.id, slots.length)

  const baseSlot = slots[slotIndex]
  const { dx, dy } = jitter(agent.id)

  return {
    position: {
      x: Math.max(2, Math.min(96, baseSlot.x + dx)),
      y: Math.max(25, Math.min(98, baseSlot.y + dy)),
    },
    zone,
  }
}

export function calculateAllPositions(
  agents: OfficeAgent[],
  previousPositions: Map<string, Position> | null,
): Map<string, AgentNodeState> {
  const result = new Map<string, AgentNodeState>()
  const slotCounters = new Map<OfficeZone, number>()

  // Sort by status priority: active first, then idle, sleeping, error
  const sorted = [...agents].sort((a, b) => {
    const order: Record<string, number> = { active: 0, idle: 1, sleeping: 2, error: 3 }
    return (order[a.status] ?? 4) - (order[b.status] ?? 4)
  })

  for (const agent of sorted) {
    const { position, zone } = assignAgentPosition(agent, slotCounters)
    result.set(agent.id, {
      agent,
      position,
      previousPosition: previousPositions?.get(agent.id) ?? null,
      zone,
    })
  }

  return result
}

/** Get the inbox desk position for flying task animations */
export const INBOX_DESK_POSITION: Position = { x: 69, y: 82 }
