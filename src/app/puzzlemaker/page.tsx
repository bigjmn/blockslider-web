import type { Metadata } from "next"
import PuzzleMaker from "@/components/PuzzleMaker"

export const metadata: Metadata = {
  title: "Puzzle Maker — Rush Push Puzzle",
  description: "Build and export your own Rush Push Puzzle levels.",
}

export default function PuzzleMakerPage() {
  return <PuzzleMaker />
}
