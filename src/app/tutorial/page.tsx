"use client"

import { useAuth } from "@/contexts/AuthContext"
import { RushPushPuzzle } from "@/components/DemoGame"
import { markSolved, type TreeResult } from "@/lib/firebase-db"
import { tutorialA } from "@/lib/tutorials"

export default function TutorialPage() {
  const { user } = useAuth()

  function handleComplete(tree: TreeResult) {
    if (!user) return
    markSolved(user.uid, "tutorial", tree).catch(console.error)
  }

  return <RushPushPuzzle {...tutorialA} onComplete={handleComplete} />
}
