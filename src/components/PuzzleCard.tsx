"use client"

import { useMemo } from "react"
import { MiniBoard } from "./MiniBoard"
import { MoveTree, type TreeNodeData } from "./MoveTree"
import type { PuzzleDoc, SolvedEntry } from "@/lib/firebase-db"

type Props = {
  date: string
  puzzle: PuzzleDoc | null
  solvedEntry: SolvedEntry | null
  onClick: () => void
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  })
}

function buildMoveTreeProps(entry: SolvedEntry) {
  const { nodes: raw, solutionId } = entry.tree

  const nodes = new Map<string, TreeNodeData>(
    Object.entries(raw).map(([id, n]) => [id, { id, parentId: n.parentId, depth: n.depth, stateKey: "" }])
  )

  const childrenMap = new Map<string, string[]>()
  nodes.forEach((_, id) => childrenMap.set(id, []))
  nodes.forEach((n, id) => {
    if (n.parentId !== null) {
      const arr = childrenMap.get(n.parentId) ?? []
      arr.push(id)
      childrenMap.set(n.parentId, arr)
    }
  })

  const solutionPath = new Set<string>()
  let cur: string | null = solutionId
  while (cur) {
    solutionPath.add(cur)
    cur = nodes.get(cur)?.parentId ?? null
  }

  const solutionMoves = nodes.get(solutionId)?.depth ?? 0
  const deadEnds = nodes.size - solutionPath.size

  return { nodes, childrenMap, solutionId, solutionPath, solutionMoves, deadEnds }
}

export function PuzzleCard({ date, puzzle, solvedEntry, onClick }: Props) {
  const treeProps = useMemo(
    () => (solvedEntry ? buildMoveTreeProps(solvedEntry) : null),
    [solvedEntry]
  )

  return (
    <button
      type="button"
      onClick={onClick}
      className="card-gradient relative w-full text-left rounded-2xl overflow-hidden border border-slate-700/60 shadow-2xl shadow-black/60 hover:border-slate-500/60 transition-colors active:scale-[0.99]"
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-4 flex items-start justify-between">
        <div>
          <p className="text-xs font-mono tracking-widest text-slate-500 mb-1">TODAY&apos;S PUZZLE</p>
          <p className="text-lg font-black text-white tracking-tight">{formatDate(date)}</p>
        </div>
        {solvedEntry && (
          <span className="text-xs font-mono tracking-widest px-2 py-1 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/25">
            SOLVED
          </span>
        )}
      </div>

      {/* Board — full width */}
      <div className="relative w-full rounded-xl overflow-hidden border border-slate-600/40">
        {puzzle ? (
          <>
            <MiniBoard gameState={puzzle.gameState} />

            {/* Solved tree overlay — covers the full board */}
            {treeProps && (
              <div className="solved-overlay-opaque absolute inset-0 flex items-center justify-center">
                <MoveTree
                  nodes={treeProps.nodes}
                  childrenMap={treeProps.childrenMap}
                  solutionId={treeProps.solutionId}
                  solutionPath={treeProps.solutionPath}
                />
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-600 font-mono px-5 py-4">No puzzle today</p>
        )}
      </div>

      {/* Stats — shown below the board when solved */}
      {treeProps && (
        <div className="flex justify-center gap-5 px-5 py-4">
          <div className="text-center">
            <div className="text-2xl font-black tabular-nums text-white">{treeProps.solutionMoves}</div>
            <div className="text-[10px] font-mono text-slate-500">{treeProps.solutionMoves === 1 ? "move" : "moves"}</div>
          </div>
          {treeProps.deadEnds > 0 && (
            <div className="text-center">
              <div className="text-2xl font-black tabular-nums text-slate-600">{treeProps.deadEnds}</div>
              <div className="text-[10px] font-mono text-slate-600">{treeProps.deadEnds === 1 ? "dead end" : "dead ends"}</div>
            </div>
          )}
        </div>
      )}
    </button>
  )
}
