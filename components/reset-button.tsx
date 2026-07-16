"use client"

import { useState } from "react"
import { NativeBiometric } from "@capgo/capacitor-native-biometric"
import { Capacitor, registerPlugin } from "@capacitor/core"
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

const resetKeys = [
  "credstore_vault_v2",
  "credstore_data",
  "credstore_lockout_until",
  "credstore_installation_id",
  "credstore_theme",
  "credstore_license",
  "credstore_license_last_seen_at",
]

type ResetVaultRecord = {
  keySlots?: Array<{
    id?: string
    biometricKey?: {
      platform?: string
    }
  }>
}

type CredStoreBiometricPlugin = {
  deleteSecret: (options: { slotId: string }) => Promise<void>
}

const CredStoreBiometric = registerPlugin<CredStoreBiometricPlugin>("CredStoreBiometric")

async function readResetValue(key: string) {
  try {
    const { Preferences } = await import("@capacitor/preferences")
    const result = await Preferences.get({ key })
    if (result.value !== null) return result.value
  } catch {
    // Web and Electron fall back to localStorage.
  }

  return localStorage.getItem(key)
}

async function removeNativeBiometricKeys() {
  const storedVault = await readResetValue("credstore_vault_v2")
  if (!storedVault) return

  let vault: ResetVaultRecord | null = null
  try {
    vault = JSON.parse(storedVault) as ResetVaultRecord
  } catch {
    return
  }

  const biometricSlots = (vault?.keySlots || []).filter((slot) => slot.id && slot.biometricKey)
  await Promise.allSettled(
    biometricSlots.map(async (slot) => {
      const slotId = String(slot.id)
      const platform = slot.biometricKey?.platform

      if (Capacitor.isNativePlatform() && platform === "capgo-secure-data") {
        await NativeBiometric.deleteData({ key: `credstore-vault-key-${slotId}` })
        return
      }

      if (Capacitor.getPlatform() === "android" && platform === "android-keystore") {
        await CredStoreBiometric.deleteSecret({ slotId })
      }
    }),
  )
}

export function ResetCredStore() {
  const [isResetting, setIsResetting] = useState(false)

  const handleReset = () => {
    setIsResetting(true)
    const reset = async () => {
      try {
        await removeNativeBiometricKeys()

        try {
          const { Preferences } = await import("@capacitor/preferences")
          await Promise.all(resetKeys.map((key) => Preferences.remove({ key })))
        } catch {
          // Web and Electron fall back to localStorage.
        }

        resetKeys.forEach((key) => localStorage.removeItem(key))

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
