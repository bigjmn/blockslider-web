# Firebase Database Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire up Firestore and anonymous Auth so daily puzzles live in the database, solved status is tracked per-user, the puzzle-maker can save puzzles (admin-only), and anyone can generate a shareable challenge link from an encoded puzzle state.

**Architecture:** Anonymous auth runs at app startup via a React context; every visitor gets a stable UID tied to their browser. Daily puzzles are stored in `puzzles/{YYYY-MM-DD}` documents; solved status is written to `users/{uid}` as a map keyed by puzzle ID. Challenge links encode the `GameState` as URL-safe base64 — no database write required.

**Tech Stack:** Next.js 16 App Router, Firebase 11 (auth + firestore), TypeScript, Tailwind CSS

---

## Context & Key Constraints

- `GameState` = `{ ball: Coord, goal: Coord, initialPieces: CarPiece[] }` (from `src/lib/puzzle-engine.ts`)
- `RushPushPuzzle` is the playable component; it currently has no `onComplete` callback — we must add one
- Admin UID bootstrapping: first run `NEXT_PUBLIC_ADMIN_UID=""`, open the app, copy UID from console/UI, paste into `.env.local`, then redeploy. The Firestore rules use a hardcoded string — update them after bootstrapping.
- Firestore rules deploy is **manual** (`firebase deploy --only firestore:rules`) — not done by code
- No tests exist in this project — skip test steps
- Check `node_modules/next/dist/docs/` for any unfamiliar Next.js 16 API before using it

---

## Task 1: Anonymous Auth Context

**Files:**
- Create: `src/contexts/AuthContext.tsx`
- Modify: `src/app/layout.tsx`

**Step 1: Create auth context**

```tsx
// src/contexts/AuthContext.tsx
"use client"
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { onAuthStateChanged, signInAnonymously, type User } from "firebase/auth"
import { auth } from "@/lib/firebase"

type AuthContextValue = { user: User | null; loading: boolean }
const AuthContext = createContext<AuthContextValue>({ user: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u)
        setLoading(false)
      } else {
        signInAnonymously(auth).catch(console.error)
      }
    })
    return unsub
  }, [])

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
```

**Step 2: Wrap layout with AuthProvider**

In `src/app/layout.tsx`, import `AuthProvider` and wrap `{children}` with it. The layout must stay a Server Component — `AuthProvider` is a Client Component, so wrapping children is fine.

```tsx
// src/app/layout.tsx  (relevant diff only)
import { AuthProvider } from "@/contexts/AuthContext"
// ...
<body>
  <AuthProvider>{children}</AuthProvider>
</body>
```

**Step 3: Commit**
```bash
git add src/contexts/AuthContext.tsx src/app/layout.tsx
git commit -m "feat: anonymous auth context provider"
```

---

## Task 2: GameState Encode/Decode

**Files:**
- Create: `src/lib/encode.ts`

**Step 1: Write encode/decode**

```ts
// src/lib/encode.ts
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
```

**Step 2: Commit**
```bash
git add src/lib/encode.ts
git commit -m "feat: URL-safe GameState encode/decode"
```

---

## Task 3: Firestore DB Helpers

**Files:**
- Create: `src/lib/firebase-db.ts`

**Step 1: Write helpers**

```ts
// src/lib/firebase-db.ts
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

// ── Puzzles ──────────────────────────────────────────────────────────────────

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
```

**Step 2: Commit**
```bash
git add src/lib/firebase-db.ts
git commit -m "feat: Firestore puzzle and user-solved helpers"
```

---

## Task 4: Update Firestore Security Rules

**Files:**
- Modify: `firestore.rules`

**Step 1: Update rules**

Replace the contents of `firestore.rules` with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /puzzles/{puzzleId} {
      allow read: if true;
      allow write: if request.auth != null
                   && request.auth.uid == "YOUR_ADMIN_UID_HERE";
    }

    match /users/{uid} {
      allow read, write: if request.auth != null
                         && request.auth.uid == uid;
    }
  }
}
```

Replace `YOUR_ADMIN_UID_HERE` after bootstrapping (see Context section above).

**Step 2: Deploy rules manually**
```bash
firebase deploy --only firestore:rules
```

**Step 3: Commit**
```bash
git add firestore.rules
git commit -m "feat: Firestore security rules — admin puzzle write, user self-write"
```

---

## Task 5: Add onComplete Callback to RushPushPuzzle

**Files:**
- Modify: `src/components/DemoGame.tsx`

`RushPushPuzzle` currently has type `PuzzleProps = { gameState: GameState; tutorial?: TutorialStep[] | null }`.  
We need to add `onComplete?: () => void` and call it when `setIsComplete(true)` fires.

**Step 1: Add prop to PuzzleProps**

```ts
export type PuzzleProps = {
  gameState: GameState
  tutorial?: TutorialStep[] | null
  onComplete?: () => void
}
```

**Step 2: Destructure in component**

```tsx
export function RushPushPuzzle({ gameState, tutorial = null, onComplete }: PuzzleProps) {
```

**Step 3: Call onComplete alongside setIsComplete**

Find the `onAnimationComplete` callback on the motion.button (around line 232). It currently reads:
```tsx
if (ballInGoalRef.current) setIsComplete(true)
```
Change to:
```tsx
if (ballInGoalRef.current) {
  setIsComplete(true)
  onComplete?.()
}
```

**Step 4: Commit**
```bash
git add src/components/DemoGame.tsx
git commit -m "feat: add onComplete callback to RushPushPuzzle"
```

---

## Task 6: Update PuzzleMaker — Save & Challenge Link

**Files:**
- Modify: `src/components/PuzzleMaker.tsx`

Add two new buttons to the header action area, replacing the existing "Copy state" button:

1. **"Create challenge link"** — available to everyone with a valid gameState. Encodes the state, builds a `/challenge/[encoded]` URL, copies it to clipboard.
2. **"Save puzzle"** — visible only when `currentUser.uid === NEXT_PUBLIC_ADMIN_UID` AND `NEXT_PUBLIC_ADMIN_UID` is set. Opens a date picker (an `<input type="date">`) and saves to Firestore.
3. **"Copy my UID"** — visible only when `NEXT_PUBLIC_ADMIN_UID` is empty. Lets the admin bootstrap their UID by copying it from the UI.

**Step 1: Add imports**

```tsx
import { useAuth } from "@/contexts/AuthContext"
import { encodeGameState } from "@/lib/encode"
import { savePuzzle } from "@/lib/firebase-db"
```

**Step 2: Add state and derived values in PuzzleMaker**

```tsx
const { user } = useAuth()
const adminUid = process.env.NEXT_PUBLIC_ADMIN_UID
const isAdmin = !!adminUid && user?.uid === adminUid

const [saveDate, setSaveDate] = useState(() => new Date().toISOString().slice(0, 10))
const [saving, setSaving] = useState(false)
const [challengeCopied, setChallengeCopied] = useState(false)
const [uidCopied, setUidCopied] = useState(false)
```

**Step 3: Add action handlers**

```tsx
function copyChallenge() {
  if (!gameState) return
  const encoded = encodeGameState(gameState)
  const url = `${window.location.origin}/challenge/${encoded}`
  navigator.clipboard.writeText(url)
  setChallengeCopied(true)
  setTimeout(() => setChallengeCopied(false), 2000)
}

async function handleSave() {
  if (!gameState || !isAdmin) return
  setSaving(true)
  try {
    const encoded = encodeGameState(gameState)
    await savePuzzle(saveDate, gameState, encoded)
    flash(`Saved as ${saveDate}!`)
  } catch (e) {
    flash("Save failed.")
    console.error(e)
  } finally {
    setSaving(false)
  }
}

function copyUid() {
  if (!user) return
  navigator.clipboard.writeText(user.uid)
  setUidCopied(true)
  setTimeout(() => setUidCopied(false), 2000)
}
```

**Step 4: Replace header button row**

Remove the existing "Copy state" button. The new button group:

```tsx
<div className="flex gap-2 flex-wrap">
  {/* Admin UID bootstrapping — only when NEXT_PUBLIC_ADMIN_UID is unset */}
  {!adminUid && user && (
    <button type="button" onClick={copyUid}
      className="rounded-xl border bg-white px-4 py-2 font-semibold shadow-sm text-sm hover:bg-zinc-50 transition-colors">
      {uidCopied ? "Copied!" : "Copy my UID"}
    </button>
  )}

  {/* Challenge link — anyone */}
  <button type="button" onClick={copyChallenge} disabled={!gameState}
    className="rounded-xl border bg-white px-4 py-2 font-semibold shadow-sm text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:bg-zinc-50 transition-colors">
    {challengeCopied ? "Link copied!" : "Create challenge link"}
  </button>

  {/* Save to Firestore — admin only */}
  {isAdmin && (
    <>
      <input type="date" value={saveDate} onChange={(e) => setSaveDate(e.target.value)}
        className="rounded-xl border px-3 py-2 text-sm font-semibold bg-white shadow-sm" />
      <button type="button" onClick={handleSave} disabled={!gameState || saving}
        className="rounded-xl bg-zinc-900 text-white px-4 py-2 font-semibold shadow-sm text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:bg-zinc-700 transition-colors">
        {saving ? "Saving…" : "Save puzzle"}
      </button>
    </>
  )}

  <button type="button" onClick={() => setMode("preview")} disabled={!gameState}
    className="rounded-xl bg-zinc-900 text-white px-4 py-2 font-semibold shadow-sm text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:bg-zinc-700 transition-colors">
    Preview →
  </button>
</div>
```

**Step 5: Add NEXT_PUBLIC_ADMIN_UID to .env.local**

```
NEXT_PUBLIC_ADMIN_UID=
```

(Leave blank until you copy your UID from the UI and paste it here.)

**Step 6: Commit**
```bash
git add src/components/PuzzleMaker.tsx .env.local
git commit -m "feat: puzzle-maker save to Firestore and challenge link"
```

---

## Task 7: Home Page — Daily Puzzle from Firestore

**Files:**
- Modify: `src/app/page.tsx`

The home page must become a Client Component so it can fetch from Firestore and track auth state. It shows today's puzzle if one exists in Firestore; otherwise falls back to the hardcoded demo puzzle.

When the puzzle completes, call `markSolved(uid, dateStr)`.

```tsx
"use client"
import { useEffect, useState } from "react"
import { RushPushPuzzle } from "@/components/DemoGame"
import { useAuth } from "@/contexts/AuthContext"
import { getPuzzle } from "@/lib/firebase-db"
import { markSolved } from "@/lib/firebase-db"
import type { GameState } from "@/lib/puzzle-engine"
import { tutorialA } from "@/lib/tutorials"

const FALLBACK: GameState = tutorialA.gameState  // or import demoGameState from DemoGame if exported

export default function Home() {
  const { user } = useAuth()
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [puzzleId, setPuzzleId] = useState<string>("")
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    getPuzzle(today).then((doc) => {
      if (doc) {
        setGameState(doc.gameState)
        setPuzzleId(today)
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

  if (!ready) return null // or a loading skeleton

  return <RushPushPuzzle gameState={gameState!} onComplete={handleComplete} />
}
```

**Note:** Check whether `tutorialA` from `src/lib/tutorials.ts` exports a `GameState` or the full `PuzzleProps`. Use the demo game state from `DemoGame.tsx` if needed — you may need to export `demoGameState` from that file.

**Commit:**
```bash
git add src/app/page.tsx
git commit -m "feat: home page loads today's puzzle from Firestore"
```

---

## Task 8: Challenge Route `/challenge/[encoded]`

**Files:**
- Create: `src/app/challenge/[encoded]/page.tsx`

This is a Client Component. It decodes the `encoded` path param, renders the puzzle, and marks it solved in the user's doc (keyed by the encoded string itself, not a date).

```tsx
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
```

**Note on `params`:** In Next.js 15+, `params` in page components is a Promise. Use `use(params)` to unwrap it. Verify this against `node_modules/next/dist/docs/` if unsure.

**Commit:**
```bash
git add src/app/challenge/
git commit -m "feat: challenge route decodes URL state and tracks solve"
```

---

## Task 9: Archive Page `/archive`

**Files:**
- Create: `src/app/archive/page.tsx`

Lists all puzzles from Firestore sorted newest-first. Shows solved status by comparing against the user's solved map.

```tsx
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
      <ul className="space-y-2">
        {puzzles.map(({ id }) => (
          <li key={id}>
            <Link href={`/?date=${id}`}
              className="flex items-center gap-3 rounded-xl bg-white/10 hover:bg-white/20 px-4 py-3 transition-colors">
              <span className="font-mono text-sm">{id}</span>
              {solved[id] && <span className="text-emerald-400 text-sm font-semibold">✓ Solved</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

**Note:** The archive links to `/?date=YYYY-MM-DD`. This requires the home page to also accept a `date` query param to load a specific puzzle instead of today's. Add that to the home page: read `searchParams.date`, fall back to today if absent.

**Commit:**
```bash
git add src/app/archive/
git commit -m "feat: archive page lists all puzzles with solved status"
```

---

## Task 10: Home Page — Support `?date=` Param

**Files:**
- Modify: `src/app/page.tsx`

Update the `useEffect` in the home page to read `window.location.search` for a `date` param:

```tsx
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
```

**Commit:**
```bash
git add src/app/page.tsx
git commit -m "feat: home page supports ?date= param for archive navigation"
```

---

## Bootstrapping Admin UID (post-deploy checklist)

1. Run `npm run dev`
2. Navigate to `/puzzlemaker`
3. Click "Copy my UID" — paste it somewhere safe
4. Add it to `.env.local`: `NEXT_PUBLIC_ADMIN_UID=<your-uid>`
5. Update `firestore.rules`: replace `YOUR_ADMIN_UID_HERE` with your UID
6. Run `firebase deploy --only firestore:rules`
7. Restart dev server — "Save puzzle" button should now appear

---

## Final Type Check

```bash
npx tsc --noEmit
```

Fix any errors before considering the feature complete.
