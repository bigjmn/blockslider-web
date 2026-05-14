export const GRID_SIZE = 8
export const CELL = 42

export type Coord = { x: number; y: number }
export type Orientation = "H" | "V"
export type Direction = "up" | "down" | "left" | "right"

export type CarPiece = {
  id: string
  type: "car"
  x: number
  y: number
  orientation: Orientation
  direction: Direction
  color: string
  label: string
}

export type BallPiece = {
  id: "ball"
  type: "ball"
  x: number
  y: number
  color: string
  label: string
  inGoal?: boolean
}

export type Piece = CarPiece | BallPiece

export type GameState = {
  ball: Coord
  goal: Coord
  initialPieces: CarPiece[]
}

export type MoveResult = {
  pieces: Piece[]
  message: string
  completed?: boolean
}

export function makeInitialPieces(gameState: GameState): Piece[] {
  return [
    ...gameState.initialPieces,
    {
      id: "ball",
      type: "ball",
      x: gameState.ball.x,
      y: gameState.ball.y,
      color: "bg-zinc-800",
      label: "●",
    },
  ]
}

export function isGoalCell(x: number, y: number, goal: Coord): boolean {
  return x === goal.x && y === goal.y
}

export function cellsFor(piece: { type: string; x: number; y: number; orientation?: Orientation }): Coord[] {
  if (piece.type !== "car") return [{ x: piece.x, y: piece.y }]
  if (piece.orientation === "H") {
    return [{ x: piece.x, y: piece.y }, { x: piece.x + 1, y: piece.y }]
  }
  return [{ x: piece.x, y: piece.y }, { x: piece.x, y: piece.y + 1 }]
}

export function key(x: number, y: number): string {
  return `${x},${y}`
}

export function inBoundsCell(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < GRID_SIZE && y < GRID_SIZE
}

export function buildOccupancy(
  pieces: { id: string; type: string; x: number; y: number; orientation?: Orientation }[],
  ignoreIds = new Set<string>()
): Map<string, string> {
  const occ = new Map<string, string>()
  for (const piece of pieces) {
    if (ignoreIds.has(piece.id)) continue
    for (const c of cellsFor(piece)) occ.set(key(c.x, c.y), piece.id)
  }
  return occ
}

export function findPieceAt(pieces: Piece[], x: number, y: number): Piece | undefined {
  return pieces.find((p) => cellsFor(p).some((c) => c.x === x && c.y === y))
}

export function directionDelta(dir: Direction): Coord {
  return {
    x: dir === "right" ? 1 : dir === "left" ? -1 : 0,
    y: dir === "down" ? 1 : dir === "up" ? -1 : 0,
  }
}

export function movePiece(pieces: Piece[], pieceId: string, goal: Coord): MoveResult {
  const piece = pieces.find((p) => p.id === pieceId)
  if (!piece) return { pieces, message: "Piece not found." }

  if (piece.type === "ball") {
    return { pieces, message: "The ball can only move when pushed." }
  }

  const dir = piece.direction
  const { x: dx, y: dy } = directionDelta(dir)

  const selfCells = cellsFor(piece)
  const destinationCells = selfCells.map((c) => ({ x: c.x + dx, y: c.y + dy }))

  if (destinationCells.some((c) => !inBoundsCell(c.x, c.y))) {
    return { pieces, message: `${piece.label} would leave the board.` }
  }

  const occWithoutSelf = buildOccupancy(pieces, new Set([piece.id]))
  const blockers = [
    ...new Set(destinationCells.map((c) => occWithoutSelf.get(key(c.x, c.y))).filter(Boolean)),
  ] as string[]

  if (blockers.length === 0) {
    return {
      pieces: pieces.map((p) => (p.id === piece.id ? { ...p, x: p.x + dx, y: p.y + dy } : p)),
      message: `${piece.label} moved ${dir}.`,
    }
  }

  if (blockers.length > 1) {
    return { pieces, message: `${piece.label} is blocked by multiple pieces.` }
  }

  const pushed = pieces.find((p) => p.id === blockers[0])
  if (!pushed) return { pieces, message: `${piece.label} is blocked.` }

  const canPush = pushed.type === "ball" || (piece as CarPiece).orientation !== (pushed as CarPiece).orientation
  if (!canPush) {
    return { pieces, message: `${piece.label} cannot push ${pushed.label} from that side.` }
  }

  const pushedCells = cellsFor(pushed)
  const pushedDestinationCells = pushedCells.map((c) => ({ x: c.x + dx, y: c.y + dy }))

  if (pushedDestinationCells.some((c) => !inBoundsCell(c.x, c.y))) {
    return { pieces, message: `${pushed.label} has no room to be pushed.` }
  }

  const occWithoutBoth = buildOccupancy(pieces, new Set([piece.id, pushed.id]))
  const pushBlocked = pushedDestinationCells.some((c) => occWithoutBoth.has(key(c.x, c.y)))
  if (pushBlocked) {
    return { pieces, message: `${pushed.label} has no room to be pushed.` }
  }

  const pushedNextX = pushed.x + dx
  const pushedNextY = pushed.y + dy
  const completed = pushed.type === "ball" && isGoalCell(pushedNextX, pushedNextY, goal)

  return {
    pieces: pieces.map((p) => {
      if (p.id === piece.id) return { ...p, x: p.x + dx, y: p.y + dy }
      if (p.id === pushed.id) return { ...p, x: pushedNextX, y: pushedNextY, inGoal: completed }
      return p
    }),
    message: completed ? "Puzzle complete!" : `${piece.label} pushed ${pushed.label} ${dir}.`,
    completed,
  }
}
