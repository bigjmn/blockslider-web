import type { GameState } from "@/lib/puzzle-engine"

export function encodeGameState(state: GameState): string {
  const json = JSON.stringify(state)
  const b64 = btoa(json)
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function decodeGameState(encoded: string): GameState {
  const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/")
  const json = atob(b64)
  return JSON.parse(json) as GameState
}
