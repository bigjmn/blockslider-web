"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { getPuzzle, getSolvedEntry, type PuzzleDoc, type SolvedEntry } from "@/lib/firebase-db"
import { PuzzleCard } from "@/components/PuzzleCard"

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

export default function Home() {
  const { user } = useAuth()
  const router = useRouter()
  const date = todayDate()

  const [puzzle, setPuzzle] = useState<PuzzleDoc | null>(null)
  const [solvedEntry, setSolvedEntry] = useState<SolvedEntry | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    getPuzzle(date).then(setPuzzle)
  }, [date])

  useEffect(() => {
    if (!user) return
    getSolvedEntry(user.uid, date).then(setSolvedEntry)
  }, [user, date])

  useEffect(() => {
    if (puzzle !== null) setReady(true)
  }, [puzzle])

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4 py-12 gap-6">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Block Slider</h1>
          <p className="text-sm text-slate-500 mt-0.5">A new puzzle every day</p>
        </div>

        {ready ? (
          <PuzzleCard
            date={date}
            puzzle={puzzle}
            solvedEntry={solvedEntry}
            onClick={() => router.push(`/puzzle/${date}`)}
          />
        ) : (
          <div className="h-48 rounded-2xl bg-slate-800/50 border border-slate-700/40 animate-pulse" />
        )}

        <div className="flex justify-between text-xs font-mono text-slate-600">
          <a href="/archive" className="hover:text-slate-400 transition-colors">Archive</a>
          <a href="/puzzlemaker" className="hover:text-slate-400 transition-colors">Puzzle Maker</a>
        </div>
      </div>
    </div>
  )
}
