"use client"

import React, { useCallback, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { RushPushPuzzle } from "./DemoGame"
import { CELL, GRID_SIZE, key, inBoundsCell, cellsFor, type GameState, type Direction, type Orientation } from "@/lib/puzzle-engine"
import { useAuth } from "@/contexts/AuthContext"
import { encodeGameState } from "@/lib/encode"
import { savePuzzle } from "@/lib/firebase-db"

// ─── Types ────────────────────────────────────────────────────────────────────

type MakerCar = {
  id: string
  type: "car"
  x: number
  y: number
  orientation: Orientation
  direction: Direction
  color: string
  label: string
}

type MakerBall = { id: "ball"; type: "ball"; x: number; y: number }
type MakerGoal = { id: "goal"; type: "goal"; x: number; y: number }
type MakerPiece = MakerCar | MakerBall | MakerGoal

type DragState = {
  id: string
  /** pixel offset within the piece where the pointer landed */
  offsetX: number
  offsetY: number
  /** current pointer position relative to board top-left */
  pointerX: number
  pointerY: number
  startPointerX: number
  startPointerY: number
}

type SnapResult = { x: number; y: number; valid: boolean }

// ─── Constants ────────────────────────────────────────────────────────────────

const CAR_COLORS: { color: string; label: string }[] = [
  { color: "bg-red-500", label: "R" },
  { color: "bg-blue-500", label: "B" },
  { color: "bg-emerald-500", label: "G" },
  { color: "bg-purple-500", label: "P" },
  { color: "bg-amber-500", label: "A" },
  { color: "bg-pink-500", label: "K" },
  { color: "bg-cyan-500", label: "C" },
  { color: "bg-orange-500", label: "O" },
  { color: "bg-red-800", label: "DR" },
  { color: "bg-blue-800", label: "DB" },
  { color: "bg-emerald-800", label: "DG" },
  { color: "bg-purple-800", label: "DP" },
  { color: "bg-amber-800", label: "DA" },
  { color: "bg-pink-800", label: "DK" },
  { color: "bg-cyan-800", label: "DC" },
  { color: "bg-orange-800", label: "DO" },
]

const DIRECTION_CYCLE: Direction[] = ["right", "down", "left", "up"]
const ARROW: Record<Direction, string> = { up: "↑", down: "↓", left: "←", right: "→" }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function orientationFor(dir: Direction): Orientation {
  return dir === "left" || dir === "right" ? "H" : "V"
}

function cellsForMaker(piece: MakerPiece): { x: number; y: number }[] {
  return cellsFor(piece)
}

function buildOcc(pieces: MakerPiece[], ignoreId?: string): Map<string, string> {
  const occ = new Map<string, string>()
  for (const p of pieces) {
    if (p.id === ignoreId) continue
    for (const c of cellsForMaker(p)) occ.set(key(c.x, c.y), p.id)
  }
  return occ
}

function pieceGridW(piece: MakerPiece): number {
  if (piece.type === "car" && piece.orientation === "H") return 2
  return 1
}
function pieceGridH(piece: MakerPiece): number {
  if (piece.type === "car" && piece.orientation === "V") return 2
  return 1
}

function computeSnap(drag: DragState, pieces: MakerPiece[]): SnapResult | null {
  const piece = pieces.find((p) => p.id === drag.id)
  if (!piece) return null

  const originX = drag.pointerX - drag.offsetX
  const originY = drag.pointerY - drag.offsetY
  const w = pieceGridW(piece)
  const h = pieceGridH(piece)
  const rawX = Math.round(originX / CELL)
  const rawY = Math.round(originY / CELL)
  const x = Math.max(0, Math.min(GRID_SIZE - w, rawX))
  const y = Math.max(0, Math.min(GRID_SIZE - h, rawY))

  const occ = buildOcc(pieces, drag.id)
  const cells = cellsForMaker({ ...piece, x, y } as MakerPiece)
  const valid = cells.every((c) => inBoundsCell(c.x, c.y) && !occ.has(key(c.x, c.y)))
  return { x, y, valid }
}

function findFreeSpot(pieces: MakerPiece[], w: number, h: number): { x: number; y: number } | null {
  const occ = buildOcc(pieces)
  for (let y = 0; y <= GRID_SIZE - h; y++) {
    for (let x = 0; x <= GRID_SIZE - w; x++) {
      const cells = w === 2
        ? [{ x, y }, { x: x + 1, y }]
        : h === 2
        ? [{ x, y }, { x, y: y + 1 }]
        : [{ x, y }]
      if (cells.every((c) => !occ.has(key(c.x, c.y)))) return { x, y }
    }
  }
  return null
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PuzzleMaker() {
  const [pieces, setPieces] = useState<MakerPiece[]>([])
  const [drag, setDrag] = useState<DragState | null>(null)
  const [mode, setMode] = useState<"edit" | "preview">("edit")
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  const boardRef = useRef<HTMLDivElement>(null)
  const colorIndexRef = useRef(0)

  const { user } = useAuth()
  const adminUid = process.env.NEXT_PUBLIC_ADMIN_UID
  const isAdmin = !!adminUid && user?.uid === adminUid

  const [saveDate, setSaveDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [challengeCopied, setChallengeCopied] = useState(false)
  const [uidCopied, setUidCopied] = useState(false)

  // Compute snap reactively so it's available in render
  const dragSnap = useMemo<SnapResult | null>(
    () => (drag ? computeSnap(drag, pieces) : null),
    [drag, pieces]
  )

  // Keep a ref so handlePointerUp can read the latest snap without stale closure
  const dragSnapRef = useRef(dragSnap)
  dragSnapRef.current = dragSnap

  // ── Computed game state ──────────────────────────────────────────────────
  const gameState = useMemo<GameState | null>(() => {
    const ball = pieces.find((p) => p.type === "ball")
    const goal = pieces.find((p) => p.type === "goal")
    if (!ball || !goal) return null
    return {
      ball: { x: ball.x, y: ball.y },
      goal: { x: goal.x, y: goal.y },
      initialPieces: pieces
        .filter((p): p is MakerCar => p.type === "car")
        .map(({ id, type, x, y, orientation, direction, color, label }) => ({
          id, type, x, y, orientation, direction, color, label,
        })),
    }
  }, [pieces])

  // ── Status flash ────────────────────────────────────────────────────────
  const statusTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  function flash(msg: string) {
    setStatusMsg(msg)
    if (statusTimeout.current) clearTimeout(statusTimeout.current)
    statusTimeout.current = setTimeout(() => setStatusMsg(null), 2000)
  }

  // ── Palette actions ─────────────────────────────────────────────────────
  function addCar() {
    const spot = findFreeSpot(pieces, 2, 1)
    if (!spot) { flash("No room for another car."); return }
    const { color, label } = CAR_COLORS[colorIndexRef.current % CAR_COLORS.length]
    colorIndexRef.current++
    setPieces((ps) => [
      ...ps,
      { id: `${colorIndexRef.current}`, type: "car", x: spot.x, y: spot.y, orientation: "H", direction: "right", color, label },
    ])
  }

  function addBall() {
    if (pieces.some((p) => p.type === "ball")) return
    const spot = findFreeSpot(pieces, 1, 1)
    if (!spot) { flash("No room for the ball."); return }
    setPieces((ps) => [...ps, { id: "ball", type: "ball", x: spot.x, y: spot.y }])
  }

  function addGoal() {
    if (pieces.some((p) => p.type === "goal")) return
    const spot = findFreeSpot(pieces, 1, 1)
    if (!spot) { flash("No room for the goal."); return }
    setPieces((ps) => [...ps, { id: "goal", type: "goal", x: spot.x, y: spot.y }])
  }

  function deletePiece(id: string) {
    setPieces((ps) => ps.filter((p) => p.id !== id))
  }

  function reset() {
    setPieces([])
    colorIndexRef.current = 0
    setMode("edit")
  }

  // ── Challenge link ───────────────────────────────────────────────────────
  function copyChallenge() {
    if (!gameState) return
    const encoded = encodeGameState(gameState)
    const url = `${window.location.origin}/challenge/${encoded}`
    navigator.clipboard.writeText(url)
    setChallengeCopied(true)
    setTimeout(() => setChallengeCopied(false), 2000)
  }

  async function handleSave() {
    if (!gameState || !isAdmin) return
    setSaving(true)
    try {
      const encoded = encodeGameState(gameState)
      await savePuzzle(saveDate, gameState, encoded)
      flash(`Saved as ${saveDate}!`)
    } catch (e) {
      flash("Save failed.")
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  function copyUid() {
    if (!user) return
    navigator.clipboard.writeText(user.uid)
    setUidCopied(true)
    setTimeout(() => setUidCopied(false), 2000)
  }

  // ── Pointer drag handlers ────────────────────────────────────────────────
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, id: string) => {
      e.preventDefault()
      const board = boardRef.current
      if (!board) return
      const boardRect = board.getBoundingClientRect()
      const pieceRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      setDrag({
        id,
        offsetX: e.clientX - pieceRect.left,
        offsetY: e.clientY - pieceRect.top,
        pointerX: e.clientX - boardRect.left,
        pointerY: e.clientY - boardRect.top,
        startPointerX: e.clientX - boardRect.left,
        startPointerY: e.clientY - boardRect.top,
      })
    },
    []
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag) return
      const board = boardRef.current
      if (!board) return
      const boardRect = board.getBoundingClientRect()
      setDrag((d) =>
        d ? { ...d, pointerX: e.clientX - boardRect.left, pointerY: e.clientY - boardRect.top } : null
      )
    },
    [drag]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!drag) return
      const snap = dragSnapRef.current
      const dist = Math.hypot(drag.pointerX - drag.startPointerX, drag.pointerY - drag.startPointerY)
      const wasDrag = dist > 6

      if (wasDrag) {
        if (snap?.valid) {
          setPieces((ps) =>
            ps.map((p) => {
              if (p.id !== drag.id) return p
              if (p.type === "car") {
                // direction may change if orientation changed (not in current flow, but safe)
                return { ...p, x: snap.x, y: snap.y }
              }
              return { ...p, x: snap.x, y: snap.y }
            })
          )
        }
        // invalid snap → piece snaps back to original (state unchanged during drag)
      } else {
        // click → cycle direction for cars
        setPieces((ps) =>
          ps.map((p) => {
            if (p.id !== drag.id || p.type !== "car") return p
            const next = DIRECTION_CYCLE[(DIRECTION_CYCLE.indexOf(p.direction) + 1) % 4]
            return { ...p, direction: next, orientation: orientationFor(next) }
          })
        )
      }

      setDrag(null)
    },
    [drag]
  )

  // ── Render piece position ────────────────────────────────────────────────
  function piecePixelPos(piece: MakerPiece): { left: number; top: number } {
    if (drag?.id === piece.id && dragSnap) {
      return { left: dragSnap.x * CELL + 3, top: dragSnap.y * CELL + 3 }
    }
    return { left: piece.x * CELL + 3, top: piece.y * CELL + 3 }
  }

  const hasBall = pieces.some((p) => p.type === "ball")
  const hasGoal = pieces.some((p) => p.type === "goal")

  // ── Preview mode ─────────────────────────────────────────────────────────
  if (mode === "preview" && gameState) {
    return (
      <div className="relative">
        <div className="absolute top-4 left-4 z-50">
          <button
            type="button"
            onClick={() => setMode("edit")}
            className="rounded-xl bg-white border border-zinc-200 shadow px-4 py-2 font-semibold text-zinc-800 hover:bg-zinc-50 flex items-center gap-2"
          >
            <span>←</span> Back to editor
          </button>
        </div>
        <RushPushPuzzle gameState={gameState} />
      </div>
    )
  }

  // ── Edit mode ─────────────────────────────────────────────────────────────
  const boardPx = GRID_SIZE * CELL

  return (
    <div className="min-h-screen bg-linear-to-br from-zinc-50 to-zinc-200 p-4 text-zinc-900">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Puzzle Maker</h1>
            <p className="text-sm text-zinc-500 mt-0.5">Build a Rush Push puzzle, then preview or export it.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {!adminUid && user && (
              <button type="button" onClick={copyUid}
                className="rounded-xl border bg-white px-4 py-2 font-semibold shadow-sm text-sm hover:bg-zinc-50 transition-colors">
                {uidCopied ? "Copied!" : "Copy my UID"}
              </button>
            )}
            <button type="button" onClick={copyChallenge} disabled={!gameState}
              className="rounded-xl border bg-white px-4 py-2 font-semibold shadow-sm text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:bg-zinc-50 transition-colors">
              {challengeCopied ? "Link copied!" : "Create challenge link"}
            </button>
            {isAdmin && (
              <>
                <input type="date" value={saveDate} onChange={(e) => setSaveDate(e.target.value)}
                  aria-label="Puzzle date"
                  className="rounded-xl border px-3 py-2 text-sm font-semibold bg-white shadow-sm" />
                <button type="button" onClick={handleSave} disabled={!gameState || saving}
                  className="rounded-xl bg-zinc-900 text-white px-4 py-2 font-semibold shadow-sm text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:bg-zinc-700 transition-colors">
                  {saving ? "Saving…" : "Save puzzle"}
                </button>
              </>
            )}
            <button type="button" onClick={() => setMode("preview")} disabled={!gameState}
              className="rounded-xl bg-zinc-900 text-white px-4 py-2 font-semibold shadow-sm text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:bg-zinc-700 transition-colors">
              Preview →
            </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-6 items-start">

          {/* Sidebar */}
          <div className="w-full md:w-44 shrink-0 rounded-2xl bg-white border shadow-sm p-4 space-y-2">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">Add pieces</p>

            <button
              type="button"
              onClick={addCar}
              className="w-full rounded-xl bg-zinc-900 text-white py-2 px-3 font-semibold text-sm hover:bg-zinc-700 transition-colors text-left"
            >
              + Car
            </button>
            <button
              type="button"
              onClick={addBall}
              disabled={hasBall}
              className="w-full rounded-xl border py-2 px-3 font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:bg-zinc-50 transition-colors text-left"
            >
              + Ball
            </button>
            <button
              type="button"
              onClick={addGoal}
              disabled={hasGoal}
              className="w-full rounded-xl border py-2 px-3 font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:bg-zinc-50 transition-colors text-left"
            >
              + Goal ◎
            </button>

            <div className="border-t my-3" />

            <button
              type="button"
              onClick={reset}
              className="w-full rounded-xl border py-2 px-3 font-semibold text-sm text-red-600 border-red-200 hover:bg-red-50 transition-colors text-left"
            >
              Reset board
            </button>

            <div className="border-t my-3" />

            <div className="text-xs text-zinc-400 space-y-1.5 leading-snug">
              <p>Click a car to cycle its direction.</p>
              <p>Drag any piece to reposition it.</p>
              <p>Tap × on a piece to delete it.</p>
            </div>

            {/* Status flash */}
            <AnimatePresence>
              {statusMsg && (
                <motion.p
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-red-500 font-medium"
                >
                  {statusMsg}
                </motion.p>
              )}
            </AnimatePresence>

            {/* Validation hint */}
            {pieces.length > 0 && !gameState && (
              <p className="text-xs text-amber-600 font-medium">
                {!hasBall && !hasGoal ? "Add a ball and a goal to preview." : !hasBall ? "Add a ball to preview." : "Add a goal to preview."}
              </p>
            )}
          </div>

          {/* Board */}
          <div className="overflow-x-auto pb-1">
            <div
              ref={boardRef}
              className="relative rounded-2xl overflow-hidden border-4 border-zinc-800 shadow-inner bg-zinc-100 touch-none select-none"
              style={{ width: boardPx, height: boardPx }}
            >
              {/* Grid cells */}
              {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, i) => {
                const cx = i % GRID_SIZE
                const cy = Math.floor(i / GRID_SIZE)
                return (
                  <div
                    key={`${cx}-${cy}`}
                    className="absolute border border-zinc-200 bg-white"
                    style={{ left: cx * CELL, top: cy * CELL, width: CELL, height: CELL }}
                  />
                )
              })}

              {/* Snap highlight */}
              {drag && dragSnap && (() => {
                const piece = pieces.find((p) => p.id === drag.id)
                if (!piece) return null
                const w = pieceGridW(piece)
                const h = pieceGridH(piece)
                return (
                  <div
                    className={`absolute pointer-events-none rounded-lg border-2 transition-colors ${
                      dragSnap.valid
                        ? "bg-emerald-100 border-emerald-400"
                        : "bg-red-100 border-red-400"
                    }`}
                    style={{
                      left: dragSnap.x * CELL + 2,
                      top: dragSnap.y * CELL + 2,
                      width: w * CELL - 4,
                      height: h * CELL - 4,
                    }}
                  />
                )
              })()}

              {/* Pieces */}
              {pieces.map((piece) => {
                const isBeingDragged = drag?.id === piece.id
                const pos = piecePixelPos(piece)
                const w = pieceGridW(piece) * CELL - 6
                const h = pieceGridH(piece) * CELL - 6
                const deleteBtn = (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); deletePiece(piece.id) }}
                    className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-zinc-700 text-white text-xs flex items-center justify-center hover:bg-red-500 active:bg-red-600 transition-colors leading-none shadow z-10"
                    aria-label="Delete piece"
                  >
                    ×
                  </button>
                )

                if (piece.type === "goal") {
                  return (
                    <motion.div
                      key={piece.id}
                      animate={{ left: pos.left, top: pos.top }}
                      transition={isBeingDragged ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 32 }}
                      className="absolute cursor-grab active:cursor-grabbing"
                      style={{ width: w, height: h, zIndex: isBeingDragged ? 30 : 10 }}
                      onPointerDown={(e) => handlePointerDown(e, piece.id)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                    >
                      <div
                        className={`w-full h-full rounded-xl border-2 border-dashed border-emerald-500 bg-emerald-50 flex items-center justify-center text-emerald-600 text-2xl font-black transition-opacity ${
                          isBeingDragged ? "opacity-80" : "opacity-100"
                        }`}
                      >
                        ◎
                        {!drag && deleteBtn}
                      </div>
                    </motion.div>
                  )
                }

                if (piece.type === "ball") {
                  return (
                    <motion.div
                      key={piece.id}
                      animate={{ left: pos.left, top: pos.top }}
                      transition={isBeingDragged ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 32 }}
                      className="absolute cursor-grab active:cursor-grabbing"
                      style={{ width: w, height: h, zIndex: isBeingDragged ? 30 : 20 }}
                      onPointerDown={(e) => handlePointerDown(e, piece.id)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                    >
                      <div
                        className={`w-full h-full rounded-full bg-zinc-800 border-2 border-white/70 shadow-md flex items-center justify-center text-white font-black text-xl transition-opacity ${
                          isBeingDragged ? "opacity-70" : "opacity-100"
                        }`}
                      >
                        ●
                        {!drag && deleteBtn}
                      </div>
                    </motion.div>
                  )
                }

                // Car
                const isDragInvalid = isBeingDragged && dragSnap && !dragSnap.valid
                return (
                  <motion.div
                    key={piece.id}
                    animate={{ left: pos.left, top: pos.top }}
                    transition={isBeingDragged ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 32 }}
                    className="absolute cursor-grab active:cursor-grabbing"
                    style={{ width: w, height: h, zIndex: isBeingDragged ? 30 : 20 }}
                    onPointerDown={(e) => handlePointerDown(e, piece.id)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                  >
                    <div
                      className={`w-full h-full rounded-xl ${piece.color} border-2 border-white/70 shadow-md flex items-center justify-center text-white font-black text-xl transition-opacity ${
                        isBeingDragged ? "opacity-80" : "opacity-100"
                      } ${isDragInvalid ? "brightness-75" : ""}`}
                    >
                      <span className="drop-shadow-sm">{ARROW[piece.direction]}</span>
                      {!drag && deleteBtn}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PuzzleMaker
