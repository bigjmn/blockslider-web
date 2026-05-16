"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/contexts/AuthContext"
import { getAllPuzzles, getSolvedMap, type PuzzleDoc } from "@/lib/firebase-db"
import type { Timestamp } from "firebase/firestore"

export default function ArchivePage() {
  const { user } = useAuth()
  const [puzzles, setPuzzles] = useState<{ id: string; data: PuzzleDoc }[]>([])
  const [solved, setSolved] = useState<Record<string, Timestamp>>({})

  useEffect(() => {
    getAllPuzzles().then(setPuzzles)
  }, [])

  useEffect(() => {
    if (!user) return
    getSolvedMap(user.uid).then(setSolved)
  }, [user])

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <h1 className="text-2xl font-black mb-6">Puzzle Archive</h1>
      {puzzles.length === 0 ? (
        <p className="text-slate-400 text-sm">No puzzles yet.</p>
      ) : (
        <ul className="space-y-2">
          {puzzles.map(({ id }) => (
            <li key={id}>
              <Link
                href={`/?date=${id}`}
                className="flex items-center gap-3 rounded-xl bg-white/10 hover:bg-white/20 px-4 py-3 transition-colors"
              >
                <span className="font-mono text-sm">{id}</span>
                {solved[id] && (
                  <span className="text-emerald-400 text-sm font-semibold">✓ Solved</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
