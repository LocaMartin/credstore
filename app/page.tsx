"use client"

import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { QRCodeCanvas } from "qrcode.react"
import { registerPlugin } from "@capacitor/core"
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
  bytesToBase64,
  createDraft,
  createId,
  createPasswordSlotForKey,
  decryptWithKey,
  decryptWithPassword,
  encryptWithKey,
  generateVaultKey,
  importVaultKey,
  LEGACY_STORAGE_KEY,
  masterKeyMeetsPolicy,
  migrateLegacyCredential,
  normalizeVaultData,
  parseVault,
  readStoredValue,
  removeStoredValue,
  sanitizeText,
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
  type LicenseRecord,
} from "@/lib/secure-vault"
import {
  Camera,
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
  ShieldCheck,
  QrCode,
  ScanFace,
  Search,
  Settings,
  Trash2,
  Wifi,
  X,
} from "lucide-react"
import { ResetCredStore } from "@/components/reset-button"

const APP_VERSION = "1.0.9"
const MAX_UNLOCK_DELAY_MS = 30000
const MAX_FAILED_UNLOCKS = 10
const FREE_SYNC_DEVICE_LIMIT = 5
const SYNC_FRAME_CHUNK_SIZE = 850
const LOCKOUT_STORAGE_KEY = "credstore_lockout_until"
const INSTALLATION_ID_STORAGE_KEY = "credstore_installation_id"
const CREDSTORE_DEEPLINK_SCHEME = "credstore"
const RUNTIME_LOGO_PATH = "./logo.svg"
const LICENSE_PUBLIC_KEY_STORAGE_KEY = "credstore_license_public_key"

type CredStoreBiometricPlugin = {
  isAvailable: () => Promise<BiometricAvailability>
  createSecret: (options: { slotId: string; secret: string }) => Promise<{ encrypted: string; iv: string }>
  getSecret: (options: { slotId: string; encrypted: string; iv: string }) => Promise<{ secret: string }>
}

const CredStoreBiometric = registerPlugin<CredStoreBiometricPlugin>("CredStoreBiometric")

const THEMES: Record<ThemeName, string> = {
  indigo: "from-purple-900 via-blue-900 to-indigo-900",
  emerald: "from-emerald-950 via-teal-900 to-slate-900",
  slate: "from-slate-950 via-slate-900 to-zinc-900",
  rose: "from-rose-950 via-fuchsia-950 to-indigo-950",
}

type BiometricAvailability = {
  available: boolean
  code?: string
  message?: string
}

type CredStoreSyncFrame = {
  scheme: typeof CREDSTORE_DEEPLINK_SCHEME
  type: "credstore-sync-frame"
  version: 2
  sessionId: string
  index: number
  total: number
  checksum: string
  chunk: string
}

declare global {
  interface Window {
    credstoreWindow?: {
      minimize: () => Promise<void>
      maximize: () => Promise<void>
      close: () => Promise<void>
    }
  }
}

const defaultLicensePublicKey = {
  key_ops: ["verify"],
  kty: "EC",
  crv: "P-256",
  x: "lmOPXYcN2okOoycLnZw5k2psqE2EIMIOyCaBGRuTrKs",
  y: "xGNS6EwTQ1DsQ1x_AFbktdYgyyUgRMoJ_V31G58Fr1A",
  ext: true,
} satisfies JsonWebKey

const TEST_LICENSE_TOKEN =
  "eyJwbGFuIjoiZW50ZXJwcmlzZSIsImtpbmQiOiJ0ZXN0IiwibGljZW5zZUlkIjoiY3JlZHN0b3JlLXRlc3QtMjAyNiIs" +
  "ImNvbXBhbnkiOiJMb2NhIE1hcnRpbiBUZXN0IExhYiIsImJ1eWVyRW1haWwiOiJsb2NhYm95ZmZAZ21haWwuY29tIiwibW" +
  "F4RGV2aWNlcyI6NTAsIm1heFVzZXJzIjo1MCwiaXNzdWVkQXQiOiIyMDI2LTA3LTEwVDE5OjIxOjU2LjY1MVoiLCJmZWF0" +
  "dXJlcyI6WyJwcmVtaXVtLXN5bmMiLCJlbXBsb3llZS1wcm9maWxlcyIsImFkbWluLWNvbnRyb2xzIiwidmlzaWJpbGl0eS" +
  "1jb250cm9scyIsImN1c3RvbWl6YXRpb24tZmVlZGJhY2siXX0.a32epznfH08P033pr54jW4RsbD3qZWDW14kyc-1YIWvI" +
  "fvi33EKN61xEilTgO7ybEIPuA3UbhjsV1ZZjSYLrrA"

const TRIAL_LICENSE_TOKEN =
  "eyJwbGFuIjoiZW50ZXJwcmlzZSIsImtpbmQiOiJ0cmlhbCIsImxpY2Vuc2VJZCI6ImNyZWRzdG9yZS10cmlhbC01LWRheS" +
  "1kZW1vIiwiY29tcGFueSI6IjUgRGF5IFRyaWFsIERlbW8iLCJidXllckVtYWlsIjoidHJpYWxAZXhhbXBsZS5jb20iLCJt" +
  "YXhEZXZpY2VzIjo1MCwibWF4VXNlcnMiOjUwLCJpc3N1ZWRBdCI6IjIwMjYtMDctMTBUMTk6MjE6NTYuNjUxWiIsImV4cG" +
  "lyZXNBdCI6IjIwMjYtMDctMTVUMTk6MjE6NTYuNjU0WiIsImZlYXR1cmVzIjpbInByZW1pdW0tc3luYyIsImVtcGxveWVl" +
  "LXByb2ZpbGVzIiwiYWRtaW4tY29udHJvbHMiLCJ2aXNpYmlsaXR5LWNvbnRyb2xzIiwiY3VzdG9taXphdGlvbi1mZWVkYm" +
  "FjayJdfQ.BDwDklRgIKBxOn1vpNKhQxHetroEWirMilzA2Pu8mPBHQ6yyHo6cww5p3V47702JLGv49IRlWq_MZi2BU04tDg"

function encodePayload(value: unknown) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)))
}

function decodePayload<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as T
}

function bytesToBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...Array.from(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=")
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
}

function checksumText(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16).padStart(8, "0")
}

function createSyncFrames(vault: VaultRecord) {
  const sessionId = createId()
  const payload = encodePayload({
    scheme: CREDSTORE_DEEPLINK_SCHEME,
    type: "credstore-offline-sync",
    version: 2,
    createdAt: new Date().toISOString(),
    vault,
  })
  const checksum = checksumText(payload)
  const chunks = Array.from({ length: Math.ceil(payload.length / SYNC_FRAME_CHUNK_SIZE) }, (_, index) =>
    payload.slice(index * SYNC_FRAME_CHUNK_SIZE, (index + 1) * SYNC_FRAME_CHUNK_SIZE),
  )

  return chunks.map((chunk, index) =>
    encodePayload({
      scheme: CREDSTORE_DEEPLINK_SCHEME,
      type: "credstore-sync-frame",
      version: 2,
      sessionId,
      index,
      total: chunks.length,
      checksum,
      chunk,
    } satisfies CredStoreSyncFrame),
  )
}

function describeBiometricAvailability(result: BiometricAvailability) {
  if (result.available) return "Strong biometric unlock is available."

  switch (result.code) {
    case "NO_HARDWARE":
      return "This device does not report biometric hardware."
    case "NONE_ENROLLED":
      return "No strong fingerprint or face biometric is enrolled on this device."
    case "UNAVAILABLE":
      return "Biometric hardware is currently unavailable."
    case "SECURITY_UPDATE_REQUIRED":
      return "Android requires a security update before biometric unlock can be used."
    case "UNSUPPORTED":
      return "This Android version does not support the required strong biometric prompt."
    case "PLUGIN_UNAVAILABLE":
      return "Native biometric plugin is unavailable in this build."
    default:
      return result.message || "Biometric unlock is not available on this device."
  }
}

function isSyncFrame(value: unknown): value is CredStoreSyncFrame {
  const frame = value as Partial<CredStoreSyncFrame>
  return (
    frame.scheme === CREDSTORE_DEEPLINK_SCHEME &&
    frame.type === "credstore-sync-frame" &&
    frame.version === 2 &&
    typeof frame.sessionId === "string" &&
    Number.isInteger(frame.index) &&
    Number.isInteger(frame.total) &&
    typeof frame.checksum === "string" &&
    typeof frame.chunk === "string"
  )
}

function registerCurrentDevice(data: VaultData, installationId: string, maxDevices: number) {
  const normalized = normalizeVaultData(data)
  const now = new Date().toISOString()
  const metadata = normalized.metadata || normalizeVaultData(null).metadata!
  const existingDevice = metadata.syncedDevices.find((device) => device.id === installationId)

  if (!existingDevice && metadata.syncedDevices.length >= maxDevices) {
    return { allowed: false, data: normalized }
  }

  const syncedDevices = existingDevice
    ? metadata.syncedDevices.map((device) =>
        device.id === installationId ? { ...device, lastSeenAt: now } : device,
      )
    : [
        ...metadata.syncedDevices,
        {
          id: installationId,
          label: `Device ${metadata.syncedDevices.length + 1}`,
          firstSeenAt: now,
          lastSeenAt: now,
        },
      ]

  return {
    allowed: true,
    data: normalizeVaultData({
      ...normalized,
      metadata: {
        ...metadata,
        deviceId: installationId,
        syncedDevices,
      },
    }),
  }
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
  return <img src={RUNTIME_LOGO_PATH} alt="CredStore" className={className} draggable={false} />
}

function DesktopWindowChrome() {
  return (
    <div className="app-drag-region fixed left-0 right-0 top-0 z-40 hidden h-8 items-center justify-between bg-black/10 px-2 text-white/80 backdrop-blur-sm md:flex">
      <div className="w-24" />
      <div className="truncate text-xs font-semibold">CredStore</div>
      <div className="app-no-drag flex w-24 justify-end gap-1">
        <button
          type="button"
          aria-label="Minimize"
          onClick={() => window.credstoreWindow?.minimize()}
          className="h-5 w-5 rounded-full bg-white/20 hover:bg-white/30"
        />
        <button
          type="button"
          aria-label="Maximize"
          onClick={() => window.credstoreWindow?.maximize()}
          className="h-5 w-5 rounded-full bg-white/20 hover:bg-white/30"
        />
        <button
          type="button"
          aria-label="Close"
          onClick={() => window.credstoreWindow?.close()}
          className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-white hover:bg-red-500"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
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
  const [syncMode, setSyncMode] = useState<"client" | "receiver">("client")
  const [syncPayload, setSyncPayload] = useState("")
  const [syncFrames, setSyncFrames] = useState<string[]>([])
  const [syncFrameIndex, setSyncFrameIndex] = useState(0)
  const [syncImportText, setSyncImportText] = useState("")
  const [syncMessage, setSyncMessage] = useState("")
  const [vaultData, setVaultData] = useState<VaultData>(normalizeVaultData(null))
  const [licenseToken, setLicenseToken] = useState("")
  const [licenseMessage, setLicenseMessage] = useState("")
  const [activeLicense, setActiveLicense] = useState<LicenseRecord | null>(null)
  const [newProfileName, setNewProfileName] = useState("")
  const [unlockDelayUntil, setUnlockDelayUntil] = useState(0)
  const [failedUnlocks, setFailedUnlocks] = useState(0)
  const [biometricMessage, setBiometricMessage] = useState("")
  const [hasVault, setHasVault] = useState(false)
  const [biometricAvailability, setBiometricAvailability] = useState<BiometricAvailability>({ available: false })
  const [installationId, setInstallationId] = useState("")
  const lastActivityRef = useRef(Date.now())
  const scanVideoRef = useRef<HTMLVideoElement | null>(null)
  const licenseScanVideoRef = useRef<HTMLVideoElement | null>(null)
  const receivedSyncFramesRef = useRef<Record<string, CredStoreSyncFrame[]>>({})

  const themeClass = THEMES[theme]
  const unlockDelayRemaining = Math.max(0, unlockDelayUntil - Date.now())
  const isUnlockDelayed = unlockDelayRemaining > 0
  const biometricAvailable = biometricAvailability.available
  const maxSyncDevices = activeLicense?.maxDevices || FREE_SYNC_DEVICE_LIMIT

  const persistVault = useCallback(
    async (
      nextCredentials: Credential[],
      nextRecord = vaultRecord,
      nextKey = vaultKey,
      nextVaultData = vaultData,
    ) => {
      if (!nextRecord || !nextKey) return false

      const key = await importVaultKey(nextKey)
      const normalized = normalizeVaultData({ ...nextVaultData, credentials: nextCredentials })
      const updatedRecord: VaultRecord = {
        ...nextRecord,
        payload: await encryptWithKey(JSON.stringify(normalized satisfies VaultData), key),
        updatedAt: new Date().toISOString(),
      }

      await writeStoredValue(VAULT_STORAGE_KEY, JSON.stringify(updatedRecord))
      setVaultRecord(updatedRecord)
      setVaultData(normalized)
      setActiveLicense(normalized.metadata?.license || null)
      return true
    },
    [vaultData, vaultKey, vaultRecord],
  )

  const lockVault = useCallback(() => {
    setIsLocked(true)
    setMasterPassword("")
    setCredentials([])
    setVaultRecord(null)
    setVaultKey(null)
    setVaultData(normalizeVaultData(null))
    setActiveLicense(null)
    setVisibleFields(new Set())
    setSearchTerm("")
    setSelectedCategory("all")
    setHasError(false)
    setUnlockDelayUntil(0)
    setFailedUnlocks(0)
    setDraft(createDraft())
    setSyncFrames([])
    setSyncPayload("")
    setSyncFrameIndex(0)
    receivedSyncFramesRef.current = {}
  }, [])

  useEffect(() => {
    const boot = async () => {
      const storedTheme = await readStoredValue(THEME_STORAGE_KEY)
      if (storedTheme && storedTheme in THEMES) setTheme(storedTheme as ThemeName)
      setHasVault(Boolean(await readStoredValue(VAULT_STORAGE_KEY)))

      const storedInstallationId = await readStoredValue(INSTALLATION_ID_STORAGE_KEY)
      const nextInstallationId = storedInstallationId || createId()
      if (!storedInstallationId) await writeStoredValue(INSTALLATION_ID_STORAGE_KEY, nextInstallationId)
      setInstallationId(nextInstallationId)

      const storedLockout = Number(await readStoredValue(LOCKOUT_STORAGE_KEY))
      if (Number.isFinite(storedLockout) && storedLockout > Date.now()) {
        setUnlockDelayUntil(storedLockout)
      }

      try {
        const result = await CredStoreBiometric.isAvailable()
        setBiometricAvailability(result)
      } catch {
        setBiometricAvailability({ available: false, code: "PLUGIN_UNAVAILABLE" })
      }

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
            const decryptedVault = normalizeVaultData(
              JSON.parse(await decryptWithKey(storedVault.payload, vaultCryptoKey)) as VaultData,
            )
            const registered = registerCurrentDevice(
              decryptedVault,
              installationId || createId(),
              decryptedVault.metadata?.license?.maxDevices || FREE_SYNC_DEVICE_LIMIT,
            )
            if (!registered.allowed) {
              throw new Error("Device limit reached")
            }
            const nextStoredVault: VaultRecord = {
              ...storedVault,
              payload: await encryptWithKey(JSON.stringify(registered.data satisfies VaultData), vaultCryptoKey),
              updatedAt: new Date().toISOString(),
            }
            await writeStoredValue(VAULT_STORAGE_KEY, JSON.stringify(nextStoredVault))

            setVaultRecord(nextStoredVault)
            setVaultKey(nextVaultKey)
            setVaultData(registered.data)
            setActiveLicense(registered.data.metadata?.license || null)
            setCredentials(registered.data.credentials)
            setIsLocked(false)
            setMasterPassword("")
            setFailedUnlocks(0)
            setUnlockDelayUntil(0)
            await removeStoredValue(LOCKOUT_STORAGE_KEY)
            lastActivityRef.current = Date.now()
            return
          } catch {
            // Try the next enabled password slot.
          }
        }

        throw new Error("Invalid master key")
      }

      if (!masterKeyMeetsPolicy(masterPassword)) {
        setBiometricMessage(
          "New master key must be at least 8 characters and include lowercase, uppercase, number, and symbol.",
        )
        setHasError(true)
        return
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
      const nextVaultData = registerCurrentDevice(
        normalizeVaultData({ credentials: migratedCredentials }),
        installationId || createId(),
        FREE_SYNC_DEVICE_LIMIT,
      ).data
      const nextRecord: VaultRecord = {
        version: 2,
        payload: await encryptWithKey(JSON.stringify(nextVaultData satisfies VaultData), vaultCryptoKey),
        keySlots: [await createPasswordSlotForKey(nextVaultKey, masterPassword, "Master password")],
        createdAt,
        updatedAt: createdAt,
      }

      await writeStoredValue(VAULT_STORAGE_KEY, JSON.stringify(nextRecord))
      if (legacyData) await removeStoredValue(LEGACY_STORAGE_KEY)
      setHasVault(true)
      setVaultRecord(nextRecord)
      setVaultKey(nextVaultKey)
      setVaultData(nextVaultData)
      setActiveLicense(nextVaultData.metadata?.license || null)
      setCredentials(migratedCredentials)
      setIsLocked(false)
      setMasterPassword("")
      setFailedUnlocks(0)
      setUnlockDelayUntil(0)
      await removeStoredValue(LOCKOUT_STORAGE_KEY)
      lastActivityRef.current = Date.now()
    } catch {
      const nextFailures = failedUnlocks + 1
      const delayMs =
        nextFailures >= MAX_FAILED_UNLOCKS
          ? MAX_UNLOCK_DELAY_MS
          : Math.min(MAX_UNLOCK_DELAY_MS, 500 * 2 ** Math.max(0, nextFailures - 1))
      const nextUnlockTime = Date.now() + delayMs

      setHasError(true)
      setMasterPassword("")
      setFailedUnlocks(nextFailures)
      setUnlockDelayUntil(nextUnlockTime)
      if (nextFailures >= MAX_FAILED_UNLOCKS) {
        await writeStoredValue(LOCKOUT_STORAGE_KEY, String(nextUnlockTime))
      }
    }
  }, [failedUnlocks, installationId, masterPassword, unlockDelayUntil])

  const unlockWithVaultKey = useCallback(async (storedVault: VaultRecord, nextVaultKey: Uint8Array) => {
    const vaultCryptoKey = await importVaultKey(nextVaultKey)
    const decryptedVault = normalizeVaultData(JSON.parse(await decryptWithKey(storedVault.payload, vaultCryptoKey)) as VaultData)
    const registered = registerCurrentDevice(
      decryptedVault,
      installationId || createId(),
      decryptedVault.metadata?.license?.maxDevices || FREE_SYNC_DEVICE_LIMIT,
    )
    if (!registered.allowed) {
      setBiometricMessage("Device limit reached. Add an enterprise license from an already-authorized device.")
      return
    }
    const nextStoredVault: VaultRecord = {
      ...storedVault,
      payload: await encryptWithKey(JSON.stringify(registered.data satisfies VaultData), vaultCryptoKey),
      updatedAt: new Date().toISOString(),
    }
    await writeStoredValue(VAULT_STORAGE_KEY, JSON.stringify(nextStoredVault))

    setVaultRecord(nextStoredVault)
    setVaultKey(nextVaultKey)
    setVaultData(registered.data)
    setActiveLicense(registered.data.metadata?.license || null)
    setCredentials(registered.data.credentials)
    setIsLocked(false)
    setMasterPassword("")
    setFailedUnlocks(0)
    setUnlockDelayUntil(0)
    await removeStoredValue(LOCKOUT_STORAGE_KEY)
    lastActivityRef.current = Date.now()
  }, [installationId])

  const handleBiometricUnlock = useCallback(
    async (type: "fingerprint" | "face") => {
      if (!biometricAvailable) {
        setBiometricMessage(describeBiometricAvailability(biometricAvailability))
        return
      }

      try {
        const storedVault = parseVault(await readStoredValue(VAULT_STORAGE_KEY))
        const slot = storedVault?.keySlots.find(
          (item) => item.enabled && item.type === type && item.biometricKey,
        )

        if (!storedVault || !slot?.biometricKey) {
          setBiometricMessage(`No ${type === "fingerprint" ? "fingerprint" : "face"} master key is saved yet.`)
          return
        }

        const result = await CredStoreBiometric.getSecret({
          slotId: slot.id,
          encrypted: slot.biometricKey.encrypted,
          iv: slot.biometricKey.iv,
        })

        await unlockWithVaultKey(storedVault, base64ToBytes(result.secret))
      } catch {
        setBiometricMessage("Biometric unlock failed.")
      }
    },
    [biometricAvailability, biometricAvailable, unlockWithVaultKey],
  )

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
      .map((field) => ({
        ...field,
        key: sanitizeText(field.key, 80).trim(),
        value: sanitizeText(field.value, 2000).trim(),
      }))
      .filter((field) => field.key && field.value)

    const title = sanitizeText(draft.title, 120).trim()
    if (!title || fields.length === 0) return

    const now = new Date().toISOString()
    const credential: Credential = {
      id: createId(),
      title,
      category: draft.category,
      fields,
      notes: sanitizeText(draft.notes, 5000).trim(),
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
    if (!masterKeyMeetsPolicy(newMasterKey)) {
      setBiometricMessage(
        "New password master key must be at least 8 characters and include lowercase, uppercase, number, and symbol.",
      )
      return
    }

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
      const slotId = createId()

      if (!biometricAvailable) {
        setBiometricMessage(describeBiometricAvailability(biometricAvailability))
        return
      }

      const protectedSecret = await CredStoreBiometric.createSecret({
        slotId,
        secret: bytesToBase64(vaultKey),
      })
      const nextRecord: VaultRecord = {
        ...vaultRecord,
        keySlots: [
          ...vaultRecord.keySlots,
          {
            id: slotId,
            type,
            label,
            enabled: true,
            biometricKey: {
              platform: "android-keystore",
              encrypted: protectedSecret.encrypted,
              iv: protectedSecret.iv,
            },
          },
        ],
      }
      setVaultRecord(nextRecord)
      await persistVault(credentials, nextRecord, vaultKey)
    },
    [biometricAvailability, biometricAvailable, credentials, persistVault, vaultKey, vaultRecord],
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
    if (!vaultRecord) return
    const deviceCount = vaultData.metadata?.syncedDevices.length || 1
    if (deviceCount >= maxSyncDevices) {
      setSyncMessage(`Device sync limit reached (${deviceCount}/${maxSyncDevices}). Add an enterprise license to sync more devices.`)
      return
    }

    const frames = createSyncFrames(vaultRecord)
    setSyncFrames(frames)
    setSyncFrameIndex(0)
    setSyncPayload(frames[0] || "")
    setSyncCode(frames.length > 1 ? `1/${frames.length}` : "1/1")
    setSyncMessage(
      frames.length > 1
        ? `Generated ${frames.length} QR frames. Scan every frame on the receiver.`
        : "One QR frame generated. Scan it on the receiver.",
    )
  }, [maxSyncDevices, vaultData.metadata?.syncedDevices.length, vaultRecord])

  const importSyncPayload = useCallback(
    async (payload = syncImportText) => {
      try {
        const trimmed = payload.trim()
        const parsed = decodePayload<
          | CredStoreSyncFrame
          | {
          scheme?: string
          type?: string
          vault?: VaultRecord
        }
        >(trimmed)

        if (parsed.scheme !== CREDSTORE_DEEPLINK_SCHEME) throw new Error("Invalid scheme")

        if (isSyncFrame(parsed)) {
          const frames = receivedSyncFramesRef.current[parsed.sessionId] || []
          frames[parsed.index] = parsed
          receivedSyncFramesRef.current[parsed.sessionId] = frames

          const receivedCount = frames.filter(Boolean).length
          if (receivedCount < parsed.total) {
            setSyncMessage(`Received frame ${parsed.index + 1}/${parsed.total}. ${parsed.total - receivedCount} remaining.`)
            setSyncImportText("")
            return
          }

          const ordered = frames.slice(0, parsed.total)
          const assembled = ordered.map((frame) => frame?.chunk || "").join("")
          if (checksumText(assembled) !== parsed.checksum) throw new Error("Checksum mismatch")

          const fullPayload = decodePayload<{
            scheme?: string
            type?: string
            vault?: VaultRecord
          }>(assembled)

          if (
            fullPayload.scheme !== CREDSTORE_DEEPLINK_SCHEME ||
            fullPayload.type !== "credstore-offline-sync" ||
            !parseVault(JSON.stringify(fullPayload.vault))
          ) {
            throw new Error("Invalid sync payload")
          }

          await writeStoredValue(VAULT_STORAGE_KEY, JSON.stringify(fullPayload.vault))
          setSyncMessage("All QR frames imported. Locking now; unlock with one of the synced master keys.")
          setSyncImportText("")
          lockVault()
          return
        }

        if (
          parsed.scheme !== CREDSTORE_DEEPLINK_SCHEME ||
          parsed.type !== "credstore-offline-sync" ||
          !parseVault(JSON.stringify(parsed.vault))
        ) {
          throw new Error("Invalid sync payload")
        }

        await writeStoredValue(VAULT_STORAGE_KEY, JSON.stringify(parsed.vault))
        setSyncMessage("Vault imported. Locking now; unlock with one of the synced master keys.")
        setSyncImportText("")
        lockVault()
      } catch {
        setSyncMessage("Invalid, incomplete, or unreadable sync QR frame.")
      }
    },
    [lockVault, syncImportText],
  )

  const scanSyncQr = useCallback(async () => {
    setSyncMessage("")

    const BarcodeDetectorCtor = (window as unknown as {
      BarcodeDetector?: new (options: { formats: string[] }) => {
        detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>
      }
    }).BarcodeDetector

    if (!BarcodeDetectorCtor || !navigator.mediaDevices?.getUserMedia) {
      setSyncMessage("Camera QR scanning is not available here. Paste the QR payload instead.")
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      const video = scanVideoRef.current
      if (!video) return

      video.srcObject = stream
      await video.play()

      const detector = new BarcodeDetectorCtor({ formats: ["qr_code"] })
      const deadline = Date.now() + 30000

      while (Date.now() < deadline) {
        const results = await detector.detect(video)
        const rawValue = results[0]?.rawValue
        if (rawValue) {
          stream.getTracks().forEach((track) => track.stop())
          await importSyncPayload(rawValue)
          return
        }
        await new Promise((resolve) => window.setTimeout(resolve, 350))
      }

      stream.getTracks().forEach((track) => track.stop())
      setSyncMessage("No QR code detected. Try again or paste the QR payload.")
    } catch {
      setSyncMessage("Camera access failed. Paste the QR payload instead.")
    }
  }, [importSyncPayload])

  const showSyncFrame = useCallback(
    (nextIndex: number) => {
      if (!syncFrames.length) return
      const boundedIndex = Math.min(Math.max(nextIndex, 0), syncFrames.length - 1)
      setSyncFrameIndex(boundedIndex)
      setSyncPayload(syncFrames[boundedIndex])
      setSyncCode(`${boundedIndex + 1}/${syncFrames.length}`)
    },
    [syncFrames],
  )

  const verifyLicenseToken = useCallback(async (token: string): Promise<LicenseRecord> => {
    const [payloadPart, signaturePart] = token.trim().split(".")
    if (!payloadPart || !signaturePart) throw new Error("License must be payload.signature")

    const publicKeyText = (await readStoredValue(LICENSE_PUBLIC_KEY_STORAGE_KEY)) || JSON.stringify(defaultLicensePublicKey)
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      JSON.parse(publicKeyText) as JsonWebKey,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    )
    const payloadBytes = new TextEncoder().encode(payloadPart)
    const signature = base64UrlToBytes(signaturePart)
    const verified = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, signature, payloadBytes)
    if (!verified) throw new Error("License signature is invalid")

    const payload = decodePayload<Omit<LicenseRecord, "token">>(payloadPart)
    if (payload.expiresAt && Date.parse(payload.expiresAt) < Date.now()) {
      throw new Error("License is expired")
    }

    return {
      ...payload,
      token,
    }
  }, [])

  const scanLicenseQr = useCallback(async () => {
    setLicenseMessage("")

    const BarcodeDetectorCtor = (window as unknown as {
      BarcodeDetector?: new (options: { formats: string[] }) => {
        detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>
      }
    }).BarcodeDetector

    if (!BarcodeDetectorCtor || !navigator.mediaDevices?.getUserMedia) {
      setLicenseMessage("Camera QR scanning is not available here. Paste the license token instead.")
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      const video = licenseScanVideoRef.current
      if (!video) return

      video.srcObject = stream
      await video.play()

      const detector = new BarcodeDetectorCtor({ formats: ["qr_code"] })
      const deadline = Date.now() + 30000

      while (Date.now() < deadline) {
        const results = await detector.detect(video)
        const rawValue = results[0]?.rawValue
        if (rawValue) {
          stream.getTracks().forEach((track) => track.stop())
          setLicenseToken(rawValue.trim())
          setLicenseMessage("License QR scanned. Press Validate Offline License.")
          return
        }
        await new Promise((resolve) => window.setTimeout(resolve, 350))
      }

      stream.getTracks().forEach((track) => track.stop())
      setLicenseMessage("No license QR detected. Try again or paste the token.")
    } catch {
      setLicenseMessage("Camera access failed. Paste the license token instead.")
    }
  }, [])

  const applyLicense = useCallback(async () => {
    if (!vaultRecord || !vaultKey) return

    try {
      const license = await verifyLicenseToken(licenseToken)
      const nextVaultData = normalizeVaultData({
        ...vaultData,
        metadata: {
          ...(vaultData.metadata || normalizeVaultData(null).metadata!),
          license,
        },
      })

      await persistVault(credentials, vaultRecord, vaultKey, nextVaultData)
      setActiveLicense(license)
      setLicenseToken("")
      setLicenseMessage(`Enterprise license enabled for ${license.company}.`)
    } catch (error) {
      setLicenseMessage(error instanceof Error ? error.message : "License validation failed.")
    }
  }, [credentials, licenseToken, persistVault, vaultData, vaultKey, vaultRecord, verifyLicenseToken])

  const addProfile = useCallback(async () => {
    if (!vaultRecord || !vaultKey || !newProfileName.trim()) return

    const currentData = normalizeVaultData(vaultData)
    const adminRole = currentData.roles?.find((role) => role.canManageProfiles) || currentData.roles?.[0]
    if (!adminRole) return

    const nextVaultData = normalizeVaultData({
      ...currentData,
      profiles: [
        ...(currentData.profiles || []),
        {
          id: createId(),
          name: sanitizeText(newProfileName, 80).trim(),
          roleId: adminRole.id,
          createdAt: new Date().toISOString(),
        },
      ],
    })

    await persistVault(credentials, vaultRecord, vaultKey, nextVaultData)
    setNewProfileName("")
  }, [credentials, newProfileName, persistVault, vaultData, vaultKey, vaultRecord])

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
      <main
        className={`min-h-dvh bg-gradient-to-br ${themeClass} flex items-center justify-center p-4 md:pt-12`}
        style={{ paddingTop: "max(2.75rem, env(safe-area-inset-top))", paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <DesktopWindowChrome />
        <Card className="w-full max-w-sm border-white/10 bg-white/5 shadow-lg">
          <CardHeader className="pb-4 text-center">
            <LogoMark className="mx-auto mb-3 h-12 w-12" />
            <CardTitle className="text-xl font-bold text-white">CredStore</CardTitle>
            <CardDescription className="text-sm text-gray-300">v{APP_VERSION}</CardDescription>
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
            <p className="text-center text-xs text-gray-400">{describeBiometricAvailability(biometricAvailability)}</p>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main
      className={`min-h-dvh bg-gradient-to-br ${themeClass} md:pt-8`}
      style={{ paddingTop: "max(2.5rem, env(safe-area-inset-top))", paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <DesktopWindowChrome />
      <div className="mx-auto max-w-4xl space-y-4 px-3 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2">
            <LogoMark className="h-8 w-8" />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-white">CredStore</h1>
              <p className="text-xs text-gray-300">
                {credentials.length} credentials - v{APP_VERSION}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
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
                    Sync encrypted vault data locally with a one-time QR payload. No internet connection is used.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={syncMode === "client" ? "default" : "outline"}
                      onClick={() => setSyncMode("client")}
                      className="text-xs"
                    >
                      Client
                    </Button>
                    <Button
                      type="button"
                      variant={syncMode === "receiver" ? "default" : "outline"}
                      onClick={() => setSyncMode("receiver")}
                      className="text-xs"
                    >
                      Receiver
                    </Button>
                  </div>
                  {syncMode === "client" ? (
                    <div className="space-y-3">
                      <div className="rounded-md border border-white/10 bg-white p-4 text-center text-black">
                        {syncPayload ? (
                          <QRCodeCanvas
                            value={syncPayload}
                            size={220}
                            level="H"
                            includeMargin
                            imageSettings={{
                              src: RUNTIME_LOGO_PATH,
                              height: 42,
                              width: 42,
                              excavate: true,
                            }}
                          />
                        ) : (
                          <QrCode className="mx-auto h-24 w-24 text-gray-500" />
                        )}
                        <p className="mt-2 font-mono text-xs tracking-[0.25em]">{syncCode || "--------"}</p>
                      </div>
                      {syncFrames.length > 1 && (
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => showSyncFrame(syncFrameIndex - 1)}
                            disabled={syncFrameIndex === 0}
                            className="border-white/20 bg-white/5 text-xs text-white hover:bg-white/10"
                          >
                            Previous
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => showSyncFrame(syncFrameIndex + 1)}
                            disabled={syncFrameIndex >= syncFrames.length - 1}
                            className="border-white/20 bg-white/5 text-xs text-white hover:bg-white/10"
                          >
                            Next
                          </Button>
                        </div>
                      )}
                      <Button
                        onClick={createSyncCode}
                        className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-sm"
                      >
                        Generate One-Time QR
                      </Button>
                      <p className="text-xs text-gray-300">
                        Free edition sync limit: {vaultData.metadata?.syncedDevices.length || 1}/{maxSyncDevices} devices.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <video
                        ref={scanVideoRef}
                        className="aspect-video w-full rounded-md border border-white/10 bg-black object-cover"
                        muted
                        playsInline
                      />
                      <Button onClick={scanSyncQr} className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-sm">
                        Open Camera and Scan
                      </Button>
                      <Textarea
                        value={syncImportText}
                        onChange={(event) => setSyncImportText(event.target.value)}
                        className="min-h-[72px] border-white/20 bg-white/5 text-xs text-white"
                        placeholder="Or paste QR payload here"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => importSyncPayload()}
                        className="w-full border-white/20 bg-white/5 text-xs text-white hover:bg-white/10"
                      >
                        Import Pasted Payload
                      </Button>
                    </div>
                  )}
                  {syncMessage && <p className="text-xs text-gray-300">{syncMessage}</p>}
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
              <DialogContent className="max-h-[calc(100dvh-4rem)] w-[calc(100vw-1rem)] max-w-5xl overflow-hidden border-gray-700 bg-gray-900/95 p-0 text-white">
                <DialogHeader>
                  <div className="border-b border-white/10 px-5 py-4">
                    <DialogTitle className="text-sm">Settings</DialogTitle>
                    <DialogDescription className="text-xs text-gray-400">
                      Theme, master keys, enterprise licensing, profiles, and reset are only available after login.
                    </DialogDescription>
                  </div>
                </DialogHeader>
                <div className="grid max-h-[calc(100dvh-9rem)] gap-4 overflow-y-auto p-5 lg:grid-cols-2">
                  <div className="space-y-4">
                  <section className="space-y-2 rounded-md border border-white/10 bg-white/5 p-3">
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
                  </section>
                  <section className="space-y-2 rounded-md border border-white/10 bg-white/5 p-3">
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
                    <p className="text-xs text-gray-400">{describeBiometricAvailability(biometricAvailability)}</p>
                  </section>
                  </div>
                  <div className="space-y-4">
                  <section className="space-y-2 rounded-md border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs">Enterprise License</Label>
                      <Badge className="bg-white/10 text-gray-200">
                        {activeLicense ? activeLicense.plan : "Community"}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-400">
                      Community sync allows {FREE_SYNC_DEVICE_LIMIT} devices. A signed enterprise license unlocks higher offline limits.
                    </p>
                    {activeLicense && (
                      <p className="text-xs text-gray-300">
                        {activeLicense.company}: up to {activeLicense.maxDevices} devices and {activeLicense.maxUsers} users.
                      </p>
                    )}
                    <Textarea
                      value={licenseToken}
                      onChange={(event) => setLicenseToken(event.target.value)}
                      className="min-h-[72px] border-white/20 bg-white/5 text-xs text-white"
                      placeholder="Paste signed enterprise license token"
                    />
                    <video
                      ref={licenseScanVideoRef}
                      className="aspect-video w-full rounded-md border border-white/10 bg-black object-cover"
                      muted
                      playsInline
                    />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Button
                        type="button"
                        onClick={scanLicenseQr}
                        variant="outline"
                        className="border-white/20 bg-white/5 text-xs text-white hover:bg-white/10"
                      >
                        <Camera className="mr-1 h-3 w-3" />
                        Scan License QR
                      </Button>
                      <Button
                        type="button"
                        onClick={applyLicense}
                        disabled={!licenseToken.trim()}
                        className="bg-gradient-to-r from-purple-500 to-blue-500 text-xs"
                      >
                        <ShieldCheck className="mr-1 h-3 w-3" />
                        Validate Offline License
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setLicenseToken(TEST_LICENSE_TOKEN)
                          setLicenseMessage("Test license loaded. Press Validate Offline License.")
                        }}
                        className="border-white/20 bg-white/5 text-xs text-white hover:bg-white/10"
                      >
                        Load Test Key
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setLicenseToken(TRIAL_LICENSE_TOKEN)
                          setLicenseMessage("5-day trial license loaded. Press Validate Offline License.")
                        }}
                        className="border-white/20 bg-white/5 text-xs text-white hover:bg-white/10"
                      >
                        Load 5-Day Trial
                      </Button>
                    </div>
                    {licenseMessage && <p className="text-xs text-gray-300">{licenseMessage}</p>}
                  </section>
                  <section className="space-y-2 rounded-md border border-white/10 bg-white/5 p-3">
                    <Label className="text-xs">Employee Profiles</Label>
                    <p className="text-xs text-gray-400">
                      Profiles are stored inside the encrypted vault. Visibility rules use the profile/role metadata foundation for enterprise ACLs.
                    </p>
                    <div className="space-y-2">
                      {vaultData.profiles?.map((profile) => (
                        <div
                          key={profile.id}
                          className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs"
                        >
                          <span>{profile.name}</span>
                          <Badge className="bg-white/10 text-gray-300">
                            {vaultData.roles?.find((role) => role.id === profile.roleId)?.name || "Role"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <Input
                        value={newProfileName}
                        onChange={(event) => setNewProfileName(event.target.value)}
                        className="border-white/20 bg-white/5 text-sm text-white"
                        placeholder="Employee profile name"
                      />
                      <Button
                        type="button"
                        onClick={addProfile}
                        disabled={!newProfileName.trim()}
                        className="bg-gradient-to-r from-purple-500 to-blue-500 text-xs"
                      >
                        Add
                      </Button>
                    </div>
                  </section>
                  <section className="space-y-2 rounded-md border border-red-400/30 bg-red-500/10 p-3">
                    <Label className="text-xs">Danger Zone</Label>
                    <ResetCredStore />
                  </section>
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
