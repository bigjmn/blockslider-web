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
