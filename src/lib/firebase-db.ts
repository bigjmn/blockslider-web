import {
  doc, getDoc, getDocs, collection,
  setDoc, updateDoc, serverTimestamp,
  query, orderBy, type Timestamp,
} from "firebase/firestore"
import { db } from "@/lib/firebase"
import type { GameState } from "@/lib/puzzle-engine"

export type PuzzleDoc = {
  encodedState: string
  gameState: GameState
  createdAt: Timestamp
}

export type TreeResult = {
  nodes: Record<string, { parentId: string | null; depth: number }>
  solutionId: string
}

export type SolvedEntry = {
  solvedAt: Timestamp
  tree: TreeResult
}

export type UserDoc = {
  solved: Record<string, SolvedEntry>
}

// ── Puzzles ───────────────────────────────────────────────────────────────────

export async function getPuzzle(dateStr: string): Promise<PuzzleDoc | null> {
  const snap = await getDoc(doc(db, "puzzles", dateStr))
  return snap.exists() ? (snap.data() as PuzzleDoc) : null
}

export async function savePuzzle(dateStr: string, gameState: GameState, encodedState: string): Promise<void> {
  await setDoc(doc(db, "puzzles", dateStr), {
    gameState,
    encodedState,
    createdAt: serverTimestamp(),
  })
}

export async function getAllPuzzles(): Promise<{ id: string; data: PuzzleDoc }[]> {
  const snap = await getDocs(query(collection(db, "puzzles"), orderBy("createdAt", "desc")))
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as PuzzleDoc }))
}

// ── User solved tracking ──────────────────────────────────────────────────────

export async function markSolved(uid: string, puzzleId: string, tree: TreeResult): Promise<void> {
  const ref = doc(db, "users", uid)
  const entry = { solvedAt: serverTimestamp(), tree }
  const snap = await getDoc(ref)
  if (snap.exists()) {
    await updateDoc(ref, { [`solved.${puzzleId}`]: entry })
  } else {
    await setDoc(ref, { solved: { [puzzleId]: entry } })
  }
}

export async function getSolvedMap(uid: string): Promise<Record<string, SolvedEntry>> {
  const snap = await getDoc(doc(db, "users", uid))
  return snap.exists() ? ((snap.data() as UserDoc).solved ?? {}) : {}
}

export async function getSolvedEntry(uid: string, puzzleId: string): Promise<SolvedEntry | null> {
  const snap = await getDoc(doc(db, "users", uid))
  if (!snap.exists()) return null
  return (snap.data() as UserDoc).solved?.[puzzleId] ?? null
}
