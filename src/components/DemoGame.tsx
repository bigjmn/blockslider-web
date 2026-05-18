"use client"

import React, { useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  GRID_SIZE,
  CELL,
  type Piece,
  type CarPiece,
  type Direction,
  type GameState,
  makeInitialPieces,
  isGoalCell,
  cellsFor,
  key,
  findPieceAt,
  movePiece,
} from "@/lib/puzzle-engine"
import { MoveTree, type TreeNodeData } from "./MoveTree"
import type { TreeResult } from "@/lib/firebase-db"

function serializePieces(pieces: Piece[]): string {
  return pieces.map((p) => `${p.id}:${p.x},${p.y}`).sort().join("|")
}

import { tutorialA } from "@/lib/tutorials"

const demoGameState: GameState = {
  ball: { x: 5, y: 3 },
  goal: { x: 2, y: 6 },
  initialPieces: [
    { id: "red",    type: "car", x: 1, y: 3, orientation: "H", direction: "right", color: "bg-red-500",     label: "R" },
    { id: "blue",   type: "car", x: 3, y: 3, orientation: "V", direction: "up",    color: "bg-blue-500",    label: "B" },
    { id: "green",  type: "car", x: 0, y: 0, orientation: "V", direction: "down",  color: "bg-emerald-500", label: "G" },
    { id: "purple", type: "car", x: 5, y: 1, orientation: "H", direction: "left",  color: "bg-purple-500",  label: "P" },
    { id: "amber",  type: "car", x: 6, y: 5, orientation: "V", direction: "up",    color: "bg-amber-500",   label: "A" },
  ],
}

export type TutorialStep = {
  move: string
  message: string
}

export type PuzzleProps = {
  gameState: GameState
  tutorial?: TutorialStep[] | null
  onComplete?: (tree: TreeResult) => void
}

// ─── Portal ───────────────────────────────────────────────────────────────────

function PortalCell({ sucking }: { sucking: boolean }) {
  return (
    <div className="w-full h-full relative flex items-center justify-center overflow-hidden">
      {/* Outer spinning ring */}
      <motion.div
        className="absolute rounded-full border border-violet-400/50"
        style={{ width: 34, height: 34 }}
        animate={{ rotate: 360 }}
        transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
      />
      {/* Inner counter-rotating ring */}
      <motion.div
        className="absolute rounded-full border border-fuchsia-300/60"
        style={{ width: 22, height: 22 }}
        animate={{ rotate: -360 }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
      />
      {/* Steady center glow */}
      <motion.div
        className="absolute rounded-full bg-violet-200"
        style={{ width: 8, height: 8, boxShadow: "0 0 10px 5px rgba(167,139,250,0.7)" }}
        animate={{ scale: [1, 1.35, 1], opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Radial pulse emitted when ball is being sucked in */}
      <AnimatePresence>
        {sucking && (
          <motion.div
            key="pulse"
            className="absolute rounded-full bg-violet-400/60"
            initial={{ scale: 0, opacity: 0.9 }}
            animate={{ scale: 3, opacity: 0 }}
            exit={{}}
            transition={{ duration: 0.55, ease: "easeOut" }}
            style={{ width: CELL - 8, height: CELL - 8 }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main puzzle component ────────────────────────────────────────────────────

export function RushPushPuzzle({ gameState, tutorial = null, onComplete }: PuzzleProps) {
  const router = useRouter()
  const [pieces, setPieces] = useState<Piece[]>(() => makeInitialPieces(gameState))
  const [history, setHistory] = useState<{ pieces: Piece[]; tutorialStep: number }[]>([])
  const [isComplete, setIsComplete] = useState(false)
  const [tutorialStep, setTutorialStep] = useState(0)

  // ── Move tree ──────────────────────────────────────────────────────────────
  const nodeIdCounter = useRef(0)
  const initialKey = serializePieces(makeInitialPieces(gameState))
  const [treeNodes, setTreeNodes] = useState<Map<string, TreeNodeData>>(
    () => new Map([["root", { id: "root", parentId: null, depth: 0, stateKey: initialKey }]])
  )
  const [treeChildren, setTreeChildren] = useState<Map<string, string[]>>(
    () => new Map([["root", []]])
  )
  const [currentNodeId, setCurrentNodeId] = useState("root")
  const [solutionNodeId, setSolutionNodeId] = useState<string | null>(null)

  const { solutionPath, solutionMoves } = useMemo(() => {
    if (!solutionNodeId) return { solutionPath: new Set<string>(), solutionMoves: 0 }
    const path = new Set<string>()
    let cur: string | null = solutionNodeId
    while (cur) {
      path.add(cur)
      cur = treeNodes.get(cur)?.parentId ?? null
    }
    return { solutionPath: path, solutionMoves: treeNodes.get(solutionNodeId)?.depth ?? 0 }
  }, [solutionNodeId, treeNodes])

  const deadEnds = treeNodes.size - solutionPath.size

  const activeTutorial =
    tutorial && tutorialStep < tutorial.length ? tutorial[tutorialStep] : null

  // True once inGoal is set — triggers the suck-in animation on the ball
  const ballInGoal = useMemo(
    () => pieces.some((p) => p.type === "ball" && p.inGoal),
    [pieces]
  )
  // Refs so onAnimationComplete can read the latest values without stale closures
  const ballInGoalRef = useRef(ballInGoal)
  ballInGoalRef.current = ballInGoal
  const treeNodesRef = useRef(treeNodes)
  treeNodesRef.current = treeNodes
  const solutionNodeIdRef = useRef(solutionNodeId)
  solutionNodeIdRef.current = solutionNodeId
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const suckInTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cellContents = useMemo(() => {
    const map = new Map<string, string>()
    for (const piece of pieces) {
      for (const c of cellsFor(piece)) map.set(key(c.x, c.y), piece.id)
    }
    return map
  }, [pieces])

  function handlePieceClick(pieceId: string) {
    if (isComplete || ballInGoal) return
    if (activeTutorial && pieceId !== activeTutorial.move) return

    const result = movePiece(pieces, pieceId, gameState.goal)
    const moved = result.pieces !== pieces
    if (!moved) return

    setHistory((h) => [...h, { pieces, tutorialStep }])

    // ── Tree update ──────────────────────────────────────────────────────────
    const newKey = serializePieces(result.pieces)
    const existingChild = (treeChildren.get(currentNodeId) ?? []).find(
      (cid) => treeNodes.get(cid)?.stateKey === newKey
    )
    let nextNodeId: string
    if (existingChild) {
      nextNodeId = existingChild
    } else {
      nextNodeId = `n${nodeIdCounter.current++}`
      const depth = (treeNodes.get(currentNodeId)?.depth ?? 0) + 1
      setTreeNodes((prev) => new Map([...prev, [nextNodeId, { id: nextNodeId, parentId: currentNodeId, depth, stateKey: newKey }]]))
      setTreeChildren((prev) => {
        const next = new Map(prev)
        next.set(currentNodeId, [...(next.get(currentNodeId) ?? []), nextNodeId])
        next.set(nextNodeId, [])
        return next
      })
    }
    setCurrentNodeId(nextNodeId)
    if (result.completed) setSolutionNodeId(nextNodeId)
    // ────────────────────────────────────────────────────────────────────────

    if (result.completed) {
      // Move the ball to the goal position but keep inGoal: false so the layout
      // spring can complete before the suck-in animation fires.
      setPieces(result.pieces.map((p) => (p.type === "ball" ? { ...p, inGoal: false } : p)))
      if (activeTutorial) setTutorialStep((s) => s + 1)

      // After the spring settles (~400 ms), flip inGoal → triggers suck-in animate
      suckInTimeout.current = setTimeout(() => {
        setPieces((ps) => ps.map((p) => (p.type === "ball" ? { ...p, inGoal: true } : p)))
      }, 420)
    } else {
      setPieces(result.pieces)
      if (activeTutorial) setTutorialStep((s) => s + 1)
    }
  }

  function takeBack() {
    if (history.length === 0 || isComplete || ballInGoal) return
    if (suckInTimeout.current) clearTimeout(suckInTimeout.current)
    const prev = history[history.length - 1]
    setHistory((h) => h.slice(0, -1))
    setPieces(prev.pieces)
    setTutorialStep(prev.tutorialStep)
    const parentId = treeNodes.get(currentNodeId)?.parentId
    if (parentId) setCurrentNodeId(parentId)
  }

  function reset() {
    if (suckInTimeout.current) clearTimeout(suckInTimeout.current)
    setPieces(makeInitialPieces(gameState))
    setHistory([])
    setIsComplete(false)
    setTutorialStep(0)
    setCurrentNodeId("root")
  }

  const boardPx = GRID_SIZE * CELL

  return (
    <div className="h-screen overflow-hidden bg-slate-900 flex flex-col items-center justify-start px-2 pt-4 sm:p-8">
      <div className="flex flex-col gap-3" style={{ width: boardPx }}>

        {/* Header */}
        <div className="flex items-center px-1">
          <h1 className="text-base font-bold text-white tracking-tight">Block Slider</h1>
        </div>

        {/* Board */}
        <div
          className="relative rounded-2xl overflow-hidden border border-slate-600/50 shadow-2xl shadow-black/60"
          style={{
            width: boardPx,
            height: boardPx,
            background: "linear-gradient(145deg, #1e293b 0%, #0f172a 100%)",
          }}
        >
          {/* Grid cells */}
          {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, i) => {
            const x = i % GRID_SIZE
            const y = Math.floor(i / GRID_SIZE)
            const isGoal = isGoalCell(x, y, gameState.goal)
            return (
              <div
                key={`${x}-${y}`}
                className="absolute"
                style={{
                  left: x * CELL,
                  top: y * CELL,
                  width: CELL,
                  height: CELL,
                  borderRight: "1px solid rgba(148,163,184,0.07)",
                  borderBottom: "1px solid rgba(148,163,184,0.07)",
                  background: isGoal
                    ? "radial-gradient(circle at 50% 50%, #4c1d95 0%, #2e1065 50%, #0d0a1e 100%)"
                    : undefined,
                }}
                onClick={() => {
                  const piece = findPieceAt(pieces, x, y)
                  if (piece) handlePieceClick(piece.id)
                }}
              >
                {isGoal && <PortalCell sucking={ballInGoal} />}
              </div>
            )
          })}

          {/* Pieces */}
          {pieces.map((piece) => {
            const isBall = piece.type === "ball"
            const isSuckedIn = isBall && piece.type === "ball" && !!piece.inGoal
            const width = isBall ? CELL : piece.orientation === "H" ? CELL * 2 : CELL
            const height = isBall ? CELL : piece.orientation === "V" ? CELL * 2 : CELL
            const arrowByDirection: Record<Direction, string> = { up: "↑", down: "↓", left: "←", right: "→" }
            const isTutorialTarget = !isBall && activeTutorial?.move === piece.id
            const isTutorialDimmed = !isBall && !!activeTutorial && !isTutorialTarget

            return (
              <motion.button
                key={piece.id}
                layout
                // Suck-in: shrink + spin toward the portal center
                animate={isSuckedIn ? { scale: 0, opacity: 0, rotate: 270 } : { scale: 1, opacity: 1, rotate: 0 }}
                transition={
                  isSuckedIn
                    ? { duration: 0.45, ease: [0.4, 0, 1, 1] }
                    : { type: "spring", stiffness: 420, damping: 32 }
                }
                onAnimationComplete={() => {
                  // Only advance to complete after the suck-in finishes
                  if (ballInGoalRef.current) {
                    setIsComplete(true)
                    const solId = solutionNodeIdRef.current
                    if (solId) {
                      const tree: TreeResult = {
                        nodes: Object.fromEntries(
                          Array.from(treeNodesRef.current.entries()).map(([id, n]) => [
                            id,
                            { parentId: n.parentId, depth: n.depth },
                          ])
                        ),
                        solutionId: solId,
                      }
                      onCompleteRef.current?.(tree)
                    }
                  }
                }}
                onClick={() => handlePieceClick(piece.id)}
                className={`absolute ${isBall ? "" : piece.color} text-white ${
                  isBall ? "rounded-full" : "rounded-xl"
                } border border-white/20 shadow-lg flex items-center justify-center font-black text-xl select-none active:scale-95 ${
                  isTutorialDimmed ? "opacity-25" : ""
                }`}
                style={{
                  left: piece.x * CELL + 3,
                  top: piece.y * CELL + 3,
                  width: width - 6,
                  height: height - 6,
                  ...(isBall
                    ? {
                        background: [
                          "radial-gradient(circle at 32% 30%, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0) 42%)",
                          "radial-gradient(circle at 68% 74%, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 38%)",
                          "radial-gradient(circle at 50% 50%, #94a3b8 0%, #1e293b 100%)",
                        ].join(", "),
                        boxShadow: "0 3px 10px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.35)",
                      }
                    : {}),
                }}
                title={isBall ? "Ball" : `${piece.label}: moves ${(piece as CarPiece).direction}`}
              >
                {!isBall && (
                  <span className="drop-shadow-sm">
                    {arrowByDirection[(piece as CarPiece).direction]}
                  </span>
                )}

                {isTutorialTarget && (
                  <>
                    <motion.span
                      className="absolute inset-0 rounded-xl border-2 border-white pointer-events-none"
                      animate={{ opacity: [1, 0.15, 1], scale: [1, 1.12, 1] }}
                      transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <span className="absolute -top-2 -right-2 flex h-4 w-4 pointer-events-none">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-white" />
                    </span>
                  </>
                )}
              </motion.button>
            )
          })}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={takeBack}
            disabled={history.length === 0 || isComplete || ballInGoal}
            className="flex-1 rounded-lg bg-white/10 text-white/70 px-3 py-2 text-sm font-semibold hover:bg-white/20 active:scale-95 transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            Take Back
          </button>
          <button
            type="button"
            onClick={reset}
            className="flex-1 rounded-lg bg-white/10 text-white/70 px-3 py-2 text-sm font-semibold hover:bg-white/20 active:scale-95 transition-colors"
          >
            Start Over
          </button>
        </div>

        {/* Tutorial message */}
        {tutorial && (
          <motion.div
            key={tutorialStep}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-white/8 border border-white/10 text-white px-4 py-3 text-sm font-medium"
          >
            {activeTutorial ? (
              activeTutorial.message
            ) : (
              <span className="text-white/50">Tutorial complete — well done!</span>
            )}
          </motion.div>
        )}
      </div>

      {/* Completion modal — shown only after ball animation finishes */}
      <AnimatePresence>
        {isComplete && solutionNodeId && (
          <motion.div
            className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0.88, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
              className="w-full max-w-sm rounded-2xl overflow-hidden text-white bg-[#0a0f1a] border border-indigo-500/25 shadow-[0_0_60px_rgba(99,102,241,0.12),0_25px_50px_rgba(0,0,0,0.7)]"
            >
              {/* Header */}
              <div className="px-5 pt-5 pb-4 border-b border-white/[0.06]">
                <p className="text-xs font-mono tracking-widest mb-1 text-violet-400">SOLVED</p>
                <h2 className="text-xl font-black tracking-tight">Puzzle complete</h2>
              </div>

              {/* Tree */}
              <div className="px-4 py-5 bg-black/30">
                <MoveTree
                  nodes={treeNodes}
                  childrenMap={treeChildren}
                  solutionId={solutionNodeId}
                  solutionPath={solutionPath}
                />
              </div>

              {/* Stats */}
              <div className="px-5 py-4 flex items-end gap-6 border-t border-white/[0.06]">
                <div>
                  <div className="text-3xl font-black tabular-nums">
                    {solutionMoves}
                  </div>
                  <div className="text-xs font-mono mt-0.5 text-slate-400/70">
                    {solutionMoves === 1 ? "move" : "moves"}
                  </div>
                </div>
                {deadEnds > 0 && (
                  <div>
                    <div className="text-3xl font-black tabular-nums text-slate-500/80">
                      {deadEnds}
                    </div>
                    <div className="text-xs font-mono mt-0.5 text-slate-500/50">
                      {deadEnds === 1 ? "dead end" : "dead ends"}
                    </div>
                  </div>
                )}
                {deadEnds === 0 && (
                  <p className="text-xs font-mono pb-1 text-cyan-400/70">no backtracking</p>
                )}
              </div>

              {/* Action */}
              <div className="px-5 pb-5">
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="w-full rounded-xl py-3 font-semibold text-sm bg-violet-400/15 text-violet-300 border border-violet-400/25 hover:bg-violet-400/25 transition-all active:scale-95"
                >
                  ← Back
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function RushPushPuzzleDemo() {
  return <RushPushPuzzle {...tutorialA} />
}
