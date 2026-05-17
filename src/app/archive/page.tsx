"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/contexts/AuthContext"
import { getAllPuzzles, getSolvedMap, type PuzzleDoc, type SolvedEntry } from "@/lib/firebase-db"

export default function ArchivePage() {
  const { user } = useAuth()
  const [puzzles, setPuzzles] = useState<{ id: string; data: PuzzleDoc }[]>([])
  const [solved, setSolved] = useState<Record<string, SolvedEntry>>({})

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
      <ul className="space-y-2">
        <li>
          <Link
            href="/tutorial"
            className="flex items-center gap-3 rounded-xl bg-white/10 hover:bg-white/20 px-4 py-3 transition-colors"
          >
            <span className="font-mono text-sm">Tutorial</span>
            {solved["tutorial"] && (
              <span className="text-emerald-400 text-sm font-semibold">✓ Solved</span>
            )}
          </Link>
        </li>
        {puzzles.length === 0 ? (
          <li className="text-slate-400 text-sm px-1 py-2">No daily puzzles yet.</li>
        ) : (
          puzzles.map(({ id }) => (
            <li key={id}>
              <Link
                href={`/puzzle/${id}`}
                className="flex items-center gap-3 rounded-xl bg-white/10 hover:bg-white/20 px-4 py-3 transition-colors"
              >
                <span className="font-mono text-sm">{id}</span>
                {solved[id] && (
                  <span className="text-emerald-400 text-sm font-semibold">✓ Solved</span>
                )}
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
