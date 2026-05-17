"use client"

import { GRID_SIZE } from "@/lib/puzzle-engine"
import type { GameState, CarPiece } from "@/lib/puzzle-engine"

const C = 10 // SVG units per cell
const S = GRID_SIZE * C // 80 SVG units total

const COLOR_MAP: Record<string, string> = {
  "bg-red-500": "#ef4444",
  "bg-blue-500": "#3b82f6",
  "bg-emerald-500": "#10b981",
  "bg-purple-500": "#a855f7",
  "bg-amber-500": "#f59e0b",
  "bg-green-500": "#22c55e",
  "bg-yellow-500": "#eab308",
  "bg-pink-500": "#ec4899",
  "bg-indigo-500": "#6366f1",
  "bg-teal-500": "#14b8a6",
  "bg-orange-500": "#f97316",
  "bg-cyan-500": "#06b6d4",
}

export function MiniBoard({ gameState }: { gameState: GameState }) {
  const { ball, goal, initialPieces } = gameState

  return (
    <svg viewBox={`0 0 ${S} ${S}`} width="100%" style={{ display: "block" }}>
      <defs>
        <linearGradient id="mb-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <radialGradient id="mb-goal" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#4c1d95" />
          <stop offset="100%" stopColor="#2e1065" />
        </radialGradient>
      </defs>

      {/* Background */}
      <rect width={S} height={S} fill="url(#mb-bg)" />

      {/* Goal */}
      <rect x={goal.x * C} y={goal.y * C} width={C} height={C} fill="url(#mb-goal)" rx={1} />

      {/* Cars */}
      {initialPieces.map((car: CarPiece) => (
        <rect
          key={car.id}
          x={car.x * C + 0.8}
          y={car.y * C + 0.8}
          width={(car.orientation === "H" ? C * 2 : C) - 1.6}
          height={(car.orientation === "V" ? C * 2 : C) - 1.6}
          fill={COLOR_MAP[car.color] ?? "#64748b"}
          rx={1.5}
        />
      ))}

      {/* Ball */}
      <circle
        cx={ball.x * C + C / 2}
        cy={ball.y * C + C / 2}
        r={C / 2 - 0.8}
        fill="#94a3b8"
      />
    </svg>
  )
}
