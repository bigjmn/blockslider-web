"use client"
import { use } from "react"
import { RushPushPuzzle } from "@/components/DemoGame"
import { useAuth } from "@/contexts/AuthContext"
import { decodeGameState } from "@/lib/encode"
import { markSolved } from "@/lib/firebase-db"

export default function ChallengePage({ params }: { params: Promise<{ encoded: string }> }) {
  const { encoded } = use(params)
  const { user } = useAuth()

  let gameState
  try {
    gameState = decodeGameState(encoded)
  } catch {
    return <p className="text-white p-8">Invalid challenge link.</p>
  }

  function handleComplete() {
    if (!user) return
    markSolved(user.uid, `challenge:${encoded}`).catch(console.error)
  }

  return <RushPushPuzzle gameState={gameState} onComplete={handleComplete} />
}
