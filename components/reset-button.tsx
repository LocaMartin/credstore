"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

export function ResetCredStore() {
  const [isResetting, setIsResetting] = useState(false)

  const handleReset = () => {
    setIsResetting(true)
    const reset = async () => {
      try {
        try {
          const { Preferences } = await import("@capacitor/preferences")
          await Preferences.remove({ key: "credstore_vault_v2" })
          await Preferences.remove({ key: "credstore_data" })
          await Preferences.remove({ key: "credstore_lockout_until" })
        } catch {
          // Web and Electron fall back to localStorage.
        }

        localStorage.removeItem("credstore_vault_v2")
        localStorage.removeItem("credstore_data")
        localStorage.removeItem("credstore_lockout_until")

        window.location.reload()
      } catch (error) {
        console.error("Error resetting CredStore:", error)
        setIsResetting(false)
      }
    }

    reset()
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-full border-white/20 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20"
        >
          Reset
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="bg-gray-900/95 border-gray-700 backdrop-blur-xl text-white">
        <AlertDialogHeader>
          <AlertDialogTitle>Reset CredStore</AlertDialogTitle>
          <AlertDialogDescription className="text-gray-400">
            This will permanently delete all your stored credentials. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="bg-white/10 border-white/20 text-white hover:bg-white/20">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleReset}
            className="bg-red-500 hover:bg-red-600 text-white"
            disabled={isResetting}
          >
            {isResetting ? "Resetting..." : "Reset"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
