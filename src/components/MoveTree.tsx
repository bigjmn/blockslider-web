"use client"

import { useMemo } from "react"
import { motion } from "framer-motion"

export type TreeNodeData = {
  id: string
  parentId: string | null
  depth: number
  stateKey: string
}

type Props = {
  nodes: Map<string, TreeNodeData>
  childrenMap: Map<string, string[]>
  solutionId: string
  solutionPath: Set<string>
}

const X_STEP = 32
const Y_STEP = 22
const PAD = 16
const R = 3.5
const R_ACCENT = 5.5

export function MoveTree({ nodes, childrenMap, solutionId, solutionPath }: Props) {
  const { positions, leafCount, maxDepth, solEdges, deadEdges } = useMemo(() => {
    const positions = new Map<string, { x: number; y: number }>()
    let leaf = 0

    function dfs(id: string): number {
      const ch = childrenMap.get(id) ?? []
      const node = nodes.get(id)
      if (!node) return leaf

      if (ch.length === 0) {
        positions.set(id, { x: node.depth * X_STEP + PAD, y: leaf * Y_STEP + PAD })
        return leaf++
      }

      const slots = ch.map(dfs)
      const mid = (slots[0] + slots[slots.length - 1]) / 2
      positions.set(id, { x: node.depth * X_STEP + PAD, y: mid * Y_STEP + PAD })
      return mid
    }

    dfs("root")

    let maxDepth = 0
    nodes.forEach((n) => { maxDepth = Math.max(maxDepth, n.depth) })

    // Solution edges = every edge where both endpoints are on the solution path
    const solEdges: { from: string; to: string }[] = []
    nodes.forEach((node, id) => {
      if (!node.parentId) return
      if (solutionPath.has(node.parentId) && solutionPath.has(id))
        solEdges.push({ from: node.parentId, to: id })
    })

    // Dead edges = every edge NOT fully on solution path
    const deadEdges: { from: string; to: string }[] = []
    nodes.forEach((node, id) => {
      if (!node.parentId) return
      if (!(solutionPath.has(node.parentId) && solutionPath.has(id)))
        deadEdges.push({ from: node.parentId, to: id })
    })

    return { positions, leafCount: leaf || 1, maxDepth, solEdges, deadEdges }
  }, [nodes, childrenMap, solutionId, solutionPath])

  const W = maxDepth * X_STEP + PAD * 2
  const H = leafCount * Y_STEP + PAD * 2
  const nodeList = Array.from(nodes.entries())

  function bezier(from: string, to: string) {
    const p1 = positions.get(from)
    const p2 = positions.get(to)
    if (!p1 || !p2) return null
    const mx = (p1.x + p2.x) / 2
    return `M ${p1.x} ${p1.y} C ${mx} ${p1.y} ${mx} ${p2.y} ${p2.x} ${p2.y}`
  }

  return (
    <div className="w-full aspect-square flex items-center justify-center">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ maxHeight: "100%", maxWidth: "100%", overflow: "visible" }}
      >
        <defs>
          <filter id="node-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="sol-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="1.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Dead branch edges — dashed, fade in */}
        {deadEdges.map(({ from, to }) => {
          const d = bezier(from, to)
          if (!d) return null
          return (
            <motion.path
              key={`d-${from}-${to}`}
              d={d}
              stroke="#64748b"
              strokeWidth={2}
              fill="none"
              strokeDasharray="4 3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.75 }}
              transition={{ delay: 0.3, duration: 0.3 }}
            />
          )
        })}

        {/* Solution path edges — solid lines */}
        {solEdges.map(({ from, to }) => {
          const p1 = positions.get(from)
          const p2 = positions.get(to)
          if (!p1 || !p2) return null
          return (
            <line
              key={`s-${from}-${to}`}
              x1={p1.x} y1={p1.y}
              x2={p2.x} y2={p2.y}
              style={{ stroke: "#e2e8f0", strokeWidth: 2, strokeLinecap: "round" } as React.CSSProperties}
            />
          )
        })}

        {/* Dead branch nodes */}
        {nodeList
          .filter(([id]) => !solutionPath.has(id))
          .map(([id]) => {
            const pos = positions.get(id)
            if (!pos) return null
            return (
              <motion.circle
                key={`dn-${id}`}
                cx={pos.x} cy={pos.y} r={R - 1}
                fill="#0f172a"
                stroke="#94a3b8"
                strokeWidth={1}
                style={{ transformOrigin: `${pos.x}px ${pos.y}px` }}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.35, duration: 0.2 }}
              />
            )
          })}

        {/* Solution path nodes */}
        {Array.from(solutionPath).map((id) => {
          const pos = positions.get(id)
          const node = nodes.get(id)
          if (!pos || !node) return null
          const isRoot = id === "root"
          const isSol = id === solutionId
          return (
            <motion.circle
              key={`sn-${id}`}
              cx={pos.x} cy={pos.y}
              r={isRoot || isSol ? R_ACCENT : R}
              fill={isRoot ? "#22d3ee" : isSol ? "#a78bfa" : "#cbd5e1"}
              filter={isSol ? "url(#node-glow)" : undefined}
              style={{ transformOrigin: `${pos.x}px ${pos.y}px` }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: node.depth * 0.04, type: "spring", stiffness: 520, damping: 28 }}
            />
          )
        })}
      </svg>
    </div>
  )
}
