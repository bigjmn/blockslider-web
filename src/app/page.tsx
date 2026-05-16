"use client"
import { useEffect, useState } from "react"
import { RushPushPuzzle } from "@/components/DemoGame"
import { useAuth } from "@/contexts/AuthContext"
import { getPuzzle, markSolved } from "@/lib/firebase-db"
import { tutorialA } from "@/lib/tutorials"
import type { GameState } from "@/lib/puzzle-engine"

const FALLBACK: GameState = tutorialA.gameState

export default function Home() {
  const { user } = useAuth()
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [puzzleId, setPuzzleId] = useState<string>("")
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const dateParam = params.get("date")
    const target = dateParam ?? new Date().toISOString().slice(0, 10)
    getPuzzle(target).then((doc) => {
      if (doc) {
        setGameState(doc.gameState)
        setPuzzleId(target)
      } else {
        setGameState(FALLBACK)
        setPuzzleId("demo")
      }
      setReady(true)
    })
  }, [])

  function handleComplete() {
    if (!user || puzzleId === "demo") return
    markSolved(user.uid, puzzleId).catch(console.error)
  }

  if (!ready) return null

  return <RushPushPuzzle gameState={gameState!} onComplete={handleComplete} />
}
