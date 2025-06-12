"use client"

import { Button } from "@/components/ui/button"

// Add this function to your CredStore component to reset everything

const resetCredStore = (setCredentials: any, setMasterPassword: any, setIsLocked: any) => {
  // Clear all stored data
  localStorage.removeItem("credstore_data")

  // Reset component state
  setCredentials([])
  setMasterPassword("")
  setIsLocked(true)

  // Show confirmation
  alert("CredStore has been reset. You can now create a new master password.")

  // Reload the page to start fresh
  window.location.reload()
}

// Add this button to your unlock screen for emergency reset
const EmergencyResetButton = ({
  setCredentials,
  setMasterPassword,
  setIsLocked,
}: { setCredentials: any; setMasterPassword: any; setIsLocked: any }) => (
  <Button
    onClick={() => {
      if (confirm("⚠️ WARNING: This will permanently delete ALL your stored credentials. Are you absolutely sure?")) {
        if (confirm("🚨 FINAL WARNING: This action cannot be undone. All data will be lost forever!")) {
          resetCredStore(setCredentials, setMasterPassword, setIsLocked)
        }
      }
    }}
    variant="destructive"
    size="sm"
    className="mt-4 bg-red-600 hover:bg-red-700"
  >
    🚨 Emergency Reset (Delete All Data)
  </Button>
)
