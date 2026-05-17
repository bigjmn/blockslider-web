"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { RushPushPuzzle } from "@/components/DemoGame"
import { useAuth } from "@/contexts/AuthContext"
import { getPuzzle, markSolved, type TreeResult } from "@/lib/firebase-db"
import type { GameState } from "@/lib/puzzle-engine"

export default function PuzzlePage() {
  const { date } = useParams<{ date: string }>()
  const { user } = useAuth()
  const router = useRouter()
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    getPuzzle(date).then((doc) => {
      if (doc) {
        setGameState(doc.gameState)
      }
      setReady(true)
    })
  }, [date])

  function handleComplete(tree: TreeResult) {
    if (!user) return
    markSolved(user.uid, date, tree).catch(console.error)
  }

  if (!ready) return null

  if (!gameState) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4">
        <p className="text-slate-400 font-mono text-sm">No puzzle for {date}</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="text-xs font-mono text-slate-500 hover:text-slate-300 transition-colors"
        >
          ← Back
        </button>
      </div>
    )
  }

  return <RushPushPuzzle gameState={gameState} onComplete={handleComplete} />
}
