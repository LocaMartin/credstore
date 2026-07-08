"use client"

type ResetState = {
  setCredentials?: (credentials: unknown[]) => void
  setMasterPassword?: (password: string) => void
  setIsLocked?: (isLocked: boolean) => void
}

export async function resetCredStore(state: ResetState = {}) {
  try {
    try {
      const { Preferences } = await import("@capacitor/preferences")
      await Preferences.remove({ key: "credstore_vault_v2" })
      await Preferences.remove({ key: "credstore_data" })
    } catch {
      // Web and Electron fall back to localStorage.
    }

    localStorage.removeItem("credstore_vault_v2")
    localStorage.removeItem("credstore_data")
    state.setCredentials?.([])
    state.setMasterPassword?.("")
    state.setIsLocked?.(true)
  } catch (error) {
    console.error("Error resetting CredStore:", error)
    throw error
  }
}
