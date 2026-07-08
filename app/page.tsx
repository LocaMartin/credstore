"use client"

/* eslint-disable @next/next/no-img-element */

import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  base64ToBytes,
  createDraft,
  createId,
  createPasswordSlotForKey,
  decryptWithKey,
  decryptWithPassword,
  encryptWithKey,
  generateVaultKey,
  importVaultKey,
  LEGACY_STORAGE_KEY,
  migrateLegacyCredential,
  parseVault,
  readStoredValue,
  removeStoredValue,
  THEME_STORAGE_KEY,
  VAULT_STORAGE_KEY,
  writeStoredValue,
  type Credential,
  type CredentialCategory,
  type CredentialDraft,
  type CredentialField,
  type LegacyCredential,
  type ThemeName,
  type VaultData,
  type VaultRecord,
} from "@/lib/secure-vault"
import {
  Copy,
  Database,
  Eye,
  EyeOff,
  Fingerprint,
  Globe,
  Key,
  Lock,
  LogOut,
  Plus,
  QrCode,
  ScanFace,
  Search,
  Settings,
  Trash2,
  Wifi,
} from "lucide-react"
import { ResetCredStore } from "@/components/reset-button"

const APP_VERSION = "1.0.6"
const MAX_UNLOCK_DELAY_MS = 30000

const THEMES: Record<ThemeName, string> = {
  indigo: "from-purple-900 via-blue-900 to-indigo-900",
  emerald: "from-emerald-950 via-teal-900 to-slate-900",
  slate: "from-slate-950 via-slate-900 to-zinc-900",
  rose: "from-rose-950 via-fuchsia-950 to-indigo-950",
}

function categoryIcon(category: CredentialCategory) {
  switch (category) {
    case "website":
      return <Globe className="h-4 w-4" />
    case "api":
      return <Key className="h-4 w-4" />
    case "database":
      return <Database className="h-4 w-4" />
    default:
      return <Settings className="h-4 w-4" />
  }
}

function LogoMark({ className }: { className: string }) {
  return <img src="./.res/logo.svg" alt="CredStore" className={className} draggable={false} />
}

function CredentialCard({
  credential,
  visibleFields,
  onToggleField,
  onCopy,
  onDelete,
}: {
  credential: Credential
  visibleFields: Set<string>
  onToggleField: (fieldId: string) => void
  onCopy: (text: string) => void
  onDelete: () => void
}) {
  return (
    <Card className="bg-white/5 border-white/10 shadow-sm hover:bg-white/10">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              {categoryIcon(credential.category)}
              <h3 className="truncate text-sm font-medium text-white">{credential.title}</h3>
              <Badge variant="secondary" className="border-white/30 bg-white/20 px-1 py-0 text-xs text-white">
                {credential.category}
              </Badge>
            </div>
            <div className="space-y-1 text-xs">
              {credential.fields.map((field) => {
                const isVisible = visibleFields.has(field.id)
                return (
                  <div className="flex items-center gap-2" key={field.id}>
                    <span className="w-20 flex-shrink-0 truncate text-gray-400">{field.key}:</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-white">
                      {field.secret && !isVisible ? "••••••••" : field.value}
                    </span>
                    {field.secret && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onToggleField(field.id)}
                        className="h-5 w-5 flex-shrink-0 p-0 text-gray-400 hover:bg-white/10 hover:text-white"
                      >
                        {isVisible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onCopy(field.value)}
                      className="h-5 w-5 flex-shrink-0 p-0 text-gray-400 hover:bg-white/10 hover:text-white"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                )
              })}
            </div>
            {credential.notes && (
              <p className="whitespace-pre-wrap break-words rounded-md border border-white/10 bg-white/5 p-2 text-xs text-gray-200">
                {credential.notes}
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            className="h-6 w-6 p-0 text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function CredStore() {
  const [isLocked, setIsLocked] = useState(true)
  const [masterPassword, setMasterPassword] = useState("")
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [vaultRecord, setVaultRecord] = useState<VaultRecord | null>(null)
  const [vaultKey, setVaultKey] = useState<Uint8Array | null>(null)
  const [draft, setDraft] = useState<CredentialDraft>(createDraft)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set())
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isSyncOpen, setIsSyncOpen] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [theme, setTheme] = useState<ThemeName>("indigo")
  const [newMasterKey, setNewMasterKey] = useState("")
  const [newMasterKeyLabel, setNewMasterKeyLabel] = useState("Backup password")
  const [syncCode, setSyncCode] = useState("")
  const [unlockDelayUntil, setUnlockDelayUntil] = useState(0)
  const [failedUnlocks, setFailedUnlocks] = useState(0)
  const [biometricMessage, setBiometricMessage] = useState("")
  const lastActivityRef = useRef(Date.now())

  const themeClass = THEMES[theme]
  const unlockDelayRemaining = Math.max(0, unlockDelayUntil - Date.now())
  const isUnlockDelayed = unlockDelayRemaining > 0

  const persistVault = useCallback(
    async (nextCredentials: Credential[], nextRecord = vaultRecord, nextKey = vaultKey) => {
      if (!nextRecord || !nextKey) return false

      const key = await importVaultKey(nextKey)
      const updatedRecord: VaultRecord = {
        ...nextRecord,
        payload: await encryptWithKey(JSON.stringify({ credentials: nextCredentials } satisfies VaultData), key),
        updatedAt: new Date().toISOString(),
      }

      await writeStoredValue(VAULT_STORAGE_KEY, JSON.stringify(updatedRecord))
      setVaultRecord(updatedRecord)
      return true
    },
    [vaultKey, vaultRecord],
  )

  const lockVault = useCallback(() => {
    setIsLocked(true)
    setMasterPassword("")
    setCredentials([])
    setVaultRecord(null)
    setVaultKey(null)
    setVisibleFields(new Set())
    setSearchTerm("")
    setSelectedCategory("all")
    setHasError(false)
    setUnlockDelayUntil(0)
    setFailedUnlocks(0)
    setDraft(createDraft())
  }, [])

  useEffect(() => {
    const boot = async () => {
      const storedTheme = await readStoredValue(THEME_STORAGE_KEY)
      if (storedTheme && storedTheme in THEMES) setTheme(storedTheme as ThemeName)
      setIsLocked(true)
    }

    boot()
  }, [])

  useEffect(() => {
    const updateActivity = () => {
      lastActivityRef.current = Date.now()
    }

    const autoLockInterval = setInterval(() => {
      if (!isLocked && Date.now() - lastActivityRef.current > 300000) lockVault()
    }, 30000)

    document.addEventListener("mousedown", updateActivity)
    document.addEventListener("keydown", updateActivity)
    document.addEventListener("touchstart", updateActivity)

    return () => {
      clearInterval(autoLockInterval)
      document.removeEventListener("mousedown", updateActivity)
      document.removeEventListener("keydown", updateActivity)
      document.removeEventListener("touchstart", updateActivity)
    }
  }, [isLocked, lockVault])

  useEffect(() => {
    if (!isLocked || !isUnlockDelayed) return

    const timer = window.setTimeout(() => setUnlockDelayUntil(0), unlockDelayRemaining)
    return () => window.clearTimeout(timer)
  }, [isLocked, isUnlockDelayed, unlockDelayRemaining])

  const handleUnlock = useCallback(async () => {
    if (Date.now() < unlockDelayUntil) return

    if (!masterPassword.trim()) {
      setHasError(true)
      return
    }

    try {
      setHasError(false)
      const storedVault = parseVault(await readStoredValue(VAULT_STORAGE_KEY))

      if (storedVault) {
        const passwordSlots = storedVault.keySlots.filter((slot) => slot.enabled && slot.type === "password")

        for (const slot of passwordSlots) {
          if (!slot.wrappedKey) continue

          try {
            const unwrapped = await decryptWithPassword(slot.wrappedKey, masterPassword)
            const nextVaultKey = base64ToBytes(unwrapped)
            const vaultCryptoKey = await importVaultKey(nextVaultKey)
            const decryptedVault = JSON.parse(await decryptWithKey(storedVault.payload, vaultCryptoKey)) as VaultData

            setVaultRecord(storedVault)
            setVaultKey(nextVaultKey)
            setCredentials(decryptedVault.credentials || [])
            setIsLocked(false)
            setMasterPassword("")
            setFailedUnlocks(0)
            setUnlockDelayUntil(0)
            lastActivityRef.current = Date.now()
            return
          } catch {
            // Try the next enabled password slot.
          }
        }

        throw new Error("Invalid master key")
      }

      const legacyData = await readStoredValue(LEGACY_STORAGE_KEY)
      const nextVaultKey = generateVaultKey()
      const migratedCredentials = legacyData
        ? (JSON.parse(await decryptWithPassword(JSON.parse(legacyData), masterPassword)) as LegacyCredential[]).map(
            migrateLegacyCredential,
          )
        : []
      const vaultCryptoKey = await importVaultKey(nextVaultKey)
      const createdAt = new Date().toISOString()
      const nextRecord: VaultRecord = {
        version: 2,
        payload: await encryptWithKey(JSON.stringify({ credentials: migratedCredentials } satisfies VaultData), vaultCryptoKey),
        keySlots: [await createPasswordSlotForKey(nextVaultKey, masterPassword, "Master password")],
        createdAt,
        updatedAt: createdAt,
      }

      await writeStoredValue(VAULT_STORAGE_KEY, JSON.stringify(nextRecord))
      if (legacyData) await removeStoredValue(LEGACY_STORAGE_KEY)
      setVaultRecord(nextRecord)
      setVaultKey(nextVaultKey)
      setCredentials(migratedCredentials)
      setIsLocked(false)
      setMasterPassword("")
      setFailedUnlocks(0)
      setUnlockDelayUntil(0)
      lastActivityRef.current = Date.now()
    } catch {
      const nextFailures = failedUnlocks + 1
      const delayMs = Math.min(MAX_UNLOCK_DELAY_MS, 500 * 2 ** Math.max(0, nextFailures - 1))

      setHasError(true)
      setMasterPassword("")
      setFailedUnlocks(nextFailures)
      setUnlockDelayUntil(Date.now() + delayMs)
    }
  }, [failedUnlocks, masterPassword, unlockDelayUntil])

  const handleBiometricUnlock = useCallback((type: "fingerprint" | "face") => {
    const label = type === "fingerprint" ? "Fingerprint" : "Face recognition"
    setBiometricMessage(`${label} unlock needs native biometric keychain support in the Android or desktop build.`)
  }, [])

  const addField = useCallback(() => {
    setDraft((previous) => ({
      ...previous,
      fields: [...previous.fields, { id: createId(), key: "Custom field", value: "", secret: false }],
    }))
  }, [])

  const updateDraftField = useCallback((id: string, patch: Partial<CredentialField>) => {
    setDraft((previous) => ({
      ...previous,
      fields: previous.fields.map((field) => (field.id === id ? { ...field, ...patch } : field)),
    }))
  }, [])

  const removeDraftField = useCallback((id: string) => {
    setDraft((previous) => ({ ...previous, fields: previous.fields.filter((field) => field.id !== id) }))
  }, [])

  const generatePassword = useCallback((fieldId: string) => {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
    const array = new Uint8Array(18)
    crypto.getRandomValues(array)
    updateDraftField(fieldId, { value: Array.from(array, (byte) => charset[byte % charset.length]).join(""), secret: true })
  }, [updateDraftField])

  const addCredential = useCallback(async () => {
    const fields = draft.fields
      .map((field) => ({ ...field, key: field.key.trim(), value: field.value.trim() }))
      .filter((field) => field.key && field.value)

    if (!draft.title.trim() || fields.length === 0) return

    const now = new Date().toISOString()
    const credential: Credential = {
      id: createId(),
      title: draft.title.trim(),
      category: draft.category,
      fields,
      notes: draft.notes.trim(),
      createdAt: now,
      updatedAt: now,
    }
    const nextCredentials = [...credentials, credential]
    setCredentials(nextCredentials)
    await persistVault(nextCredentials)
    setDraft(createDraft())
    setIsAddDialogOpen(false)
  }, [credentials, draft, persistVault])

  const deleteCredential = useCallback(
    async (id: string) => {
      const nextCredentials = credentials.filter((credential) => credential.id !== id)
      setCredentials(nextCredentials)
      await persistVault(nextCredentials)
    },
    [credentials, persistVault],
  )

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {
      const textarea = document.createElement("textarea")
      textarea.value = text
      textarea.style.position = "fixed"
      textarea.style.opacity = "0"
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand("copy")
      document.body.removeChild(textarea)
    })
  }, [])

  const addPasswordMasterKey = useCallback(async () => {
    if (!vaultRecord || !vaultKey || !newMasterKey.trim()) return

    const slot = await createPasswordSlotForKey(vaultKey, newMasterKey, newMasterKeyLabel.trim() || "Backup password")
    const nextRecord: VaultRecord = { ...vaultRecord, keySlots: [...vaultRecord.keySlots, slot] }
    setVaultRecord(nextRecord)
    await persistVault(credentials, nextRecord, vaultKey)
    setNewMasterKey("")
    setNewMasterKeyLabel("Backup password")
  }, [credentials, newMasterKey, newMasterKeyLabel, persistVault, vaultKey, vaultRecord])

  const addNativePlaceholder = useCallback(
    async (type: "fingerprint" | "face") => {
      if (!vaultRecord || !vaultKey) return

      const label = type === "fingerprint" ? "Fingerprint master key" : "Face master key"
      const nextRecord: VaultRecord = {
        ...vaultRecord,
        keySlots: [...vaultRecord.keySlots, { id: createId(), type, label, enabled: false }],
      }
      setVaultRecord(nextRecord)
      await persistVault(credentials, nextRecord, vaultKey)
    },
    [credentials, persistVault, vaultKey, vaultRecord],
  )

  const removeMasterKey = useCallback(
    async (slotId: string) => {
      if (!vaultRecord || !vaultKey) return

      const enabledPasswordSlots = vaultRecord.keySlots.filter((slot) => slot.enabled && slot.type === "password")
      const slot = vaultRecord.keySlots.find((item) => item.id === slotId)
      if (slot?.type === "password" && enabledPasswordSlots.length <= 1) return

      const nextRecord: VaultRecord = {
        ...vaultRecord,
        keySlots: vaultRecord.keySlots.filter((item) => item.id !== slotId),
      }
      setVaultRecord(nextRecord)
      await persistVault(credentials, nextRecord, vaultKey)
    },
    [credentials, persistVault, vaultKey, vaultRecord],
  )

  const changeTheme = useCallback(async (nextTheme: ThemeName) => {
    setTheme(nextTheme)
    await writeStoredValue(THEME_STORAGE_KEY, nextTheme)
  }, [])

  const createSyncCode = useCallback(() => {
    const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (value) => (value % 10).toString()).join("")
    setSyncCode(code)
  }, [])

  const toggleFieldVisibility = useCallback((fieldId: string) => {
    setVisibleFields((previous) => {
      const next = new Set(previous)
      if (next.has(fieldId)) next.delete(fieldId)
      else next.add(fieldId)
      return next
    })
  }, [])

  const filteredCredentials = useMemo(() => {
    return credentials.filter((credential) => {
      const search = searchTerm.trim().toLowerCase()
      const matchesCategory = selectedCategory === "all" || credential.category === selectedCategory
      const matchesSearch =
        !search ||
        credential.title.toLowerCase().includes(search) ||
        credential.fields.some(
          (field) => field.key.toLowerCase().includes(search) || (!field.secret && field.value.toLowerCase().includes(search)),
        )

      return matchesCategory && matchesSearch
    })
  }, [credentials, searchTerm, selectedCategory])

  if (isLocked) {
    return (
      <main className={`min-h-dvh bg-gradient-to-br ${themeClass} flex items-center justify-center p-4`}>
        <Card className="w-full max-w-sm border-white/10 bg-white/5 shadow-lg">
          <CardHeader className="pb-4 text-center">
            <LogoMark className="mx-auto mb-3 h-12 w-12" />
            <CardTitle className="text-xl font-bold text-white">CredStore</CardTitle>
            <CardDescription className="text-sm text-gray-300">Secure Credential Manager - v{APP_VERSION}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="master-password" className="text-sm text-white">
                Master Key
              </Label>
              <Input
                id="master-password"
                type="password"
                value={masterPassword}
                onChange={(event) => setMasterPassword(event.target.value)}
                className={`bg-white/5 text-sm text-white placeholder:text-gray-400 ${hasError ? "border-red-500" : "border-white/20"}`}
                placeholder="Enter or create master key"
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleUnlock()
                }}
                autoFocus
              />
              {hasError && <p className="text-xs text-red-400">Invalid master key or corrupted vault data</p>}
              {biometricMessage && <p className="text-xs text-amber-300">{biometricMessage}</p>}
              {isUnlockDelayed && (
                <p className="text-xs text-amber-300">
                  Too many failed attempts. Try again in {Math.ceil(unlockDelayRemaining / 1000)}s.
                </p>
              )}
            </div>
            <Button
              onClick={handleUnlock}
              className="w-full border-0 bg-gradient-to-r from-purple-500 to-blue-500 text-sm text-white hover:from-purple-600 hover:to-blue-600"
              disabled={!masterPassword || isUnlockDelayed}
            >
              <Lock className="mr-2 h-4 w-4" />
              Unlock Vault
            </Button>
            <p className="text-center text-xs text-gray-400">AES-256-GCM encrypted</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-white/20 bg-white/5 text-xs text-white hover:bg-white/10"
                onClick={() => handleBiometricUnlock("fingerprint")}
              >
                <Fingerprint className="mr-2 h-4 w-4" />
                Fingerprint
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-white/20 bg-white/5 text-xs text-white hover:bg-white/10"
                onClick={() => handleBiometricUnlock("face")}
              >
                <ScanFace className="mr-2 h-4 w-4" />
                Face
              </Button>
            </div>
            <p className="text-center text-xs text-gray-400">Biometric unlock needs native keychain support.</p>
            <ResetCredStore />
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className={`min-h-dvh bg-gradient-to-br ${themeClass}`}>
      <div className="mx-auto max-w-4xl space-y-4 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <LogoMark className="h-8 w-8" />
            <div>
              <h1 className="text-lg font-bold text-white">CredStore</h1>
              <p className="text-xs text-gray-300">
                {credentials.length} credentials - v{APP_VERSION}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Dialog open={isSyncOpen} onOpenChange={setIsSyncOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="border-white/20 bg-white/5 px-2 py-1 text-xs text-white hover:bg-white/10">
                  <Wifi className="mr-1 h-3 w-3" />
                  Sync
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm border-gray-700 bg-gray-900/95 text-white">
                <DialogHeader>
                  <DialogTitle className="text-sm">Local Device Sync</DialogTitle>
                  <DialogDescription className="text-xs text-gray-400">
                    Device-to-device sync will use a one-time pairing code before Bluetooth or Wi-Fi transfer.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="rounded-md border border-white/10 bg-white/5 p-4 text-center">
                    <QrCode className="mx-auto mb-2 h-10 w-10 text-gray-300" />
                    <p className="font-mono text-2xl tracking-[0.35em] text-white">{syncCode || "------"}</p>
                    <p className="mt-2 text-xs text-gray-400">Native QR scan and local transport plugins are required for transfer.</p>
                  </div>
                  <Button onClick={createSyncCode} className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-sm">
                    Generate One-Time Code
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="border-white/20 bg-white/5 px-2 py-1 text-xs text-white hover:bg-white/10">
                  <Settings className="mr-1 h-3 w-3" />
                  Settings
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md border-gray-700 bg-gray-900/95 text-white">
                <DialogHeader>
                  <DialogTitle className="text-sm">Settings</DialogTitle>
                  <DialogDescription className="text-xs text-gray-400">Theme and master key settings are only available after login.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Theme</Label>
                    <Select value={theme} onValueChange={(value) => changeTheme(value as ThemeName)}>
                      <SelectTrigger className="border-white/20 bg-white/5 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-gray-700 bg-gray-900/95 text-white">
                        <SelectItem value="indigo">Indigo</SelectItem>
                        <SelectItem value="emerald">Emerald</SelectItem>
                        <SelectItem value="slate">Slate</SelectItem>
                        <SelectItem value="rose">Rose</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Master Keys</Label>
                    <div className="space-y-2">
                      {vaultRecord?.keySlots.map((slot) => (
                        <div
                          key={slot.id}
                          className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            {slot.type === "password" && <Key className="h-3 w-3" />}
                            {slot.type === "fingerprint" && <Fingerprint className="h-3 w-3" />}
                            {slot.type === "face" && <ScanFace className="h-3 w-3" />}
                            <span>{slot.label}</span>
                            {!slot.enabled && <Badge className="bg-white/10 text-gray-300">native plugin needed</Badge>}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeMasterKey(slot.id)}
                            className="h-6 px-2 text-red-300 hover:bg-red-500/10"
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr]">
                      <Input
                        value={newMasterKeyLabel}
                        onChange={(event) => setNewMasterKeyLabel(event.target.value)}
                        className="border-white/20 bg-white/5 text-sm text-white"
                        placeholder="Label"
                      />
                      <Input
                        value={newMasterKey}
                        onChange={(event) => setNewMasterKey(event.target.value)}
                        className="border-white/20 bg-white/5 text-sm text-white"
                        placeholder="New password key"
                        type="password"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        onClick={addPasswordMasterKey}
                        className="bg-gradient-to-r from-purple-500 to-blue-500 text-xs"
                        disabled={!newMasterKey}
                      >
                        Add Password
                      </Button>
                      <Button
                        onClick={() => addNativePlaceholder("fingerprint")}
                        variant="outline"
                        className="border-white/20 bg-white/5 text-xs text-white hover:bg-white/10"
                      >
                        Fingerprint
                      </Button>
                      <Button
                        onClick={() => addNativePlaceholder("face")}
                        variant="outline"
                        className="border-white/20 bg-white/5 text-xs text-white hover:bg-white/10"
                      >
                        Face
                      </Button>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button onClick={lockVault} variant="outline" size="sm" className="border-white/20 bg-white/5 px-2 py-1 text-xs text-white hover:bg-white/10">
              <LogOut className="mr-1 h-3 w-3" />
              Lock
            </Button>
          </div>
        </div>

        <Card className="border-white/10 bg-white/5 shadow-sm">
          <CardContent className="p-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="h-8 border-white/20 bg-white/5 pl-7 text-sm text-white placeholder:text-gray-400"
                />
              </div>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="h-8 w-full border-white/20 bg-white/5 text-sm text-white sm:w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-gray-700 bg-gray-900/95 text-white">
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="website">Website</SelectItem>
                  <SelectItem value="api">API</SelectItem>
                  <SelectItem value="database">Database</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="h-8 bg-gradient-to-r from-purple-500 to-blue-500 px-3 text-sm text-white hover:from-purple-600 hover:to-blue-600">
                    <Plus className="mr-1 h-3 w-3" />
                    Add
                  </Button>
                </DialogTrigger>
                <DialogContent
                  className={
                    "grid max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-md " +
                    "grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden border-gray-700 " +
                    "bg-gray-900/95 p-0 text-white sm:max-h-[90dvh]"
                  }
                >
                  <DialogHeader className="px-6 pb-3 pt-6">
                    <DialogTitle className="text-sm">Add Credential</DialogTitle>
                    <DialogDescription className="text-xs text-gray-400">
                      Store named fields like username, password, API secret, URL, token, or anything else.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain px-6 pb-6">
                    <div className="space-y-1">
                      <Label htmlFor="title" className="text-xs">Title</Label>
                      <Input
                        id="title"
                        value={draft.title}
                        onChange={(event) => setDraft((previous) => ({ ...previous, title: event.target.value }))}
                        className="h-8 border-white/20 bg-white/5 text-sm text-white"
                        placeholder="Google"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Fields</Label>
                      <div className="space-y-2">
                        {draft.fields.map((field) => (
                          <div
                            key={field.id}
                            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-1"
                          >
                            <Input
                              value={field.key}
                              onChange={(event) => updateDraftField(field.id, { key: event.target.value })}
                              className="h-8 border-white/20 bg-white/5 text-sm text-white"
                              placeholder="Key"
                            />
                            <div className="flex gap-1">
                              <Input
                                value={field.value}
                                onChange={(event) => updateDraftField(field.id, { value: event.target.value })}
                                className="h-8 border-white/20 bg-white/5 text-sm text-white"
                                placeholder="Value"
                                type={field.secret ? "password" : "text"}
                              />
                              {field.key.toLowerCase().includes("pass") && (
                                <Button
                                  type="button"
                                  onClick={() => generatePassword(field.id)}
                                  variant="outline"
                                  className="h-8 border-white/20 bg-white/5 px-2 text-xs text-white hover:bg-white/10"
                                >
                                  Gen
                                </Button>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => updateDraftField(field.id, { secret: !field.secret })}
                                className="h-8 border-white/20 bg-white/5 px-2 text-xs text-white hover:bg-white/10"
                              >
                                {field.secret ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => removeDraftField(field.id)}
                                className="h-8 px-2 text-red-300 hover:bg-red-500/10"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <Button type="button" variant="outline" onClick={addField} className="h-8 w-full border-white/20 bg-white/5 text-xs text-white hover:bg-white/10">
                        Add Field
                      </Button>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Category</Label>
                      <Select value={draft.category} onValueChange={(value) => setDraft((previous) => ({ ...previous, category: value as CredentialCategory }))}>
                        <SelectTrigger className="h-8 border-white/20 bg-white/5 text-sm text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border-gray-700 bg-gray-900/95 text-white">
                          <SelectItem value="website">Website</SelectItem>
                          <SelectItem value="api">API Key</SelectItem>
                          <SelectItem value="database">Database</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Notes</Label>
                      <Textarea
                        value={draft.notes}
                        onChange={(event) => setDraft((previous) => ({ ...previous, notes: event.target.value }))}
                        className="min-h-[84px] scroll-mt-24 border-white/20 bg-white/5 text-sm text-white"
                        placeholder="Optional notes"
                      />
                    </div>
                    <Button
                      onClick={addCredential}
                      className={
                        "sticky bottom-0 h-10 w-full bg-gradient-to-r from-purple-500 to-blue-500 " +
                        "text-sm shadow-[0_-12px_24px_rgba(17,24,39,0.95)]"
                      }
                      disabled={!draft.title || !draft.fields.some((field) => field.key && field.value)}
                    >
                      Add Credential
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        <div className="max-h-[calc(100dvh-150px)] space-y-2 overflow-y-auto">
          {filteredCredentials.length === 0 ? (
            <Card className="border-white/10 bg-white/5 shadow-sm">
              <CardContent className="p-6 text-center">
                <LogoMark className="mx-auto mb-2 h-12 w-12 opacity-60" />
                <h3 className="mb-1 text-lg font-medium text-white">No credentials found</h3>
                <p className="text-sm text-gray-400">{searchTerm || selectedCategory !== "all" ? "Try adjusting your search." : "Add your first credential."}</p>
              </CardContent>
            </Card>
          ) : (
            filteredCredentials.map((credential) => (
              <CredentialCard
                key={credential.id}
                credential={credential}
                visibleFields={visibleFields}
                onToggleField={toggleFieldVisibility}
                onCopy={copyToClipboard}
                onDelete={() => deleteCredential(credential.id)}
              />
            ))
          )}
        </div>
      </div>
    </main>
  )
}
