'use client'

import { FURNITURE } from './office-layout'
import type { FurnitureItem, FurnitureLayer } from './office-types'

const ASSET_MAP: Record<FurnitureItem['type'], string> = {
  'desk':       '/office/desk.png',
  'inbox-desk': '/office/inbox-desk.png',
  'plant':      '/office/plant.png',
  'whiteboard': '/office/whiteboard.png',
  'rug':        '/office/rug.png',
  'cabinet':    '/office/cabinet.png',
  'printer':    '/office/printer.png',
}

// Z-index by layer: floor < agents (20) < desk < wall
const LAYER_Z: Record<FurnitureLayer, number> = {
  floor: 5,
  desk: 25,
  wall: 30,
}

interface OfficeFurnitureProps {
  layer: FurnitureLayer
}

export function OfficeFurniture({ layer }: OfficeFurnitureProps) {
  const items = FURNITURE.filter(f => f.layer === layer)

  return (
    <>
      {items.map((item) => (
        <div
          key={item.id}
          className="absolute pointer-events-none select-none"
          style={{
            left: `${item.position.x}%`,
            top: `${item.position.y}%`,
            width: `${item.width}%`,
            height: `${item.height}%`,
            transform: 'translate(-50%, -50%)',
            zIndex: LAYER_Z[item.layer],
            imageRendering: 'pixelated',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ASSET_MAP[item.type]}
            alt={item.type}
            className="w-full h-full object-contain"
            style={{ imageRendering: 'pixelated' }}
            draggable={false}
          />
        </div>
      ))}
    </>
  )
}
