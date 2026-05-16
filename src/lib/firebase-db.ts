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

export type UserDoc = {
  solved: Record<string, Timestamp>
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

export async function markSolved(uid: string, puzzleId: string): Promise<void> {
  const ref = doc(db, "users", uid)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    await updateDoc(ref, { [`solved.${puzzleId}`]: serverTimestamp() })
  } else {
    await setDoc(ref, { solved: { [puzzleId]: serverTimestamp() } })
  }
}

export async function getSolvedMap(uid: string): Promise<Record<string, Timestamp>> {
  const snap = await getDoc(doc(db, "users", uid))
  return snap.exists() ? ((snap.data() as UserDoc).solved ?? {}) : {}
}
