"use client"

import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { QRCodeCanvas } from "qrcode.react"
import { Capacitor, registerPlugin } from "@capacitor/core"
import { AccessControl, BiometryType, NativeBiometric } from "@capgo/capacitor-native-biometric"
import { hashes as ed25519Hashes, verifyAsync as verifyEd25519 } from "@noble/ed25519"
import { gzipSync, gunzipSync, strFromU8, strToU8 } from "fflate"
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
import { MarkdownDocument } from "@/components/markdown-document"
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
  type EncryptedPayload,
  type KeySlot,
  type LegacyCredential,
  type ThemeName,
  type VaultData,
  type VaultRecord,
  type LicenseRecord,
  type BiometricKey,
  type EnterpriseGroup,
  type EnterpriseProfile,
} from "@/lib/secure-vault"
import {
  Camera,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  Copy,
  Database,
  Eye,
  EyeOff,
  Fingerprint,
  Globe,
  Key,
  Loader2,
  Lock,
  LogOut,
  Pencil,
  Plus,
  ShieldCheck,
  Square,
  QrCode,
  ScanFace,
  Search,
  Settings,
  Trash2,
  User,
  Users,
  Wifi,
  X,
} from "lucide-react"
import { ResetCredStore } from "@/components/reset-button"
import securityMarkdown from "@/SECURITY.md"
import commercialLicenseMarkdown from "@/LICENSE-PRO.md"
import privacyTermsPricingMarkdown from "@/docs/legal/PRIVACY-TERMS-PRICING.md"
import userManualMarkdown from "@/docs/USER-MANUAL.md"

const APP_VERSION = "1.0.23"
const MAX_UNLOCK_DELAY_MS = 30000
const MAX_FAILED_UNLOCKS = 10
const FREE_SYNC_DEVICE_LIMIT = 5
const LOCKOUT_STORAGE_KEY = "credstore_lockout_until"
const INSTALLATION_ID_STORAGE_KEY = "credstore_installation_id"
const CREDSTORE_DEEPLINK_SCHEME = "credstore"
const RUNTIME_LOGO_PATH = "./logo.svg"
const LICENSE_CLOCK_STORAGE_KEY = "credstore_license_last_seen_at"
const SYNC_QR_PREFIX = "cs1."
const SYNC_PAIRING_PREFIX = "csp1."
const ADMIN_AUTH_LOCKOUT_MS = 30000
const MAX_ADMIN_AUTH_FAILURES = 5

ed25519Hashes.sha512Async = async (message) =>
  new Uint8Array(await crypto.subtle.digest("SHA-512", new Uint8Array(message).buffer))

type CredStoreBiometricPlugin = {
  isAvailable: () => Promise<BiometricAvailability>
  createSecret: (options: { slotId: string; secret: string }) => Promise<{ encrypted: string; iv: string }>
  getSecret: (options: { slotId: string; encrypted: string; iv: string }) => Promise<{ secret: string }>
  deleteSecret: (options: { slotId: string }) => Promise<void>
}

type CredStoreBluetoothDevice = {
  id: string
  name?: string
  host?: string
  port?: number
  deviceId?: string
}

type CredStoreBluetoothPlugin = {
  requestBluetoothPermissions: () => Promise<{ granted: boolean }>
  isAvailable: () => Promise<{ available: boolean; code?: string; message?: string }>
  listBondedDevices: () => Promise<{ devices: CredStoreBluetoothDevice[] }>
  startReceiver: () => Promise<{ payload: string }>
  sendPayload: (options: { deviceId: string; payload: string }) => Promise<void>
  stopReceiver: () => Promise<void>
}

type CredStoreLocalSyncPlugin = {
  isAvailable: () => Promise<{ available: boolean; code?: string; message?: string }>
  discoverReceivers: (options: { otp: string }) => Promise<{ devices: CredStoreBluetoothDevice[] }>
  startReceiver: (options: { otp: string; checksum?: string }) => Promise<{ payload: string; deviceName?: string; deviceId?: string }>
  sendPayload: (options: { host: string; port: number; otp: string; checksum: string; payload: string }) => Promise<void>
  stopReceiver: () => Promise<void>
}

const CredStoreBiometric = registerPlugin<CredStoreBiometricPlugin>("CredStoreBiometric")
const CredStoreBluetooth = registerPlugin<CredStoreBluetoothPlugin>("CredStoreBluetooth")

type FaceDetectorBox = { x: number; y: number; width: number; height: number }
type FaceDetectorResult = { boundingBox?: FaceDetectorBox }
type BrowserFaceDetector = {
  detect: (source: HTMLVideoElement | HTMLCanvasElement) => Promise<FaceDetectorResult[]>
}

declare const FaceDetector:
  | undefined
  | (new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => BrowserFaceDetector)

class QrRenderBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    this.props.onError()
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="grid min-h-[220px] place-items-center rounded-md border border-red-400/30 bg-red-950/10 p-4 text-sm text-red-900">
          Pairing QR could not render. Use the OTP and local transfer instead.
        </div>
      )
    }

    return this.props.children
  }
}

const THEMES: Record<ThemeName, string> = {
  indigo: "from-purple-900 via-blue-900 to-indigo-900",
  emerald: "from-emerald-950 via-teal-900 to-slate-900",
  slate: "from-slate-950 via-slate-900 to-zinc-900",
  rose: "from-rose-950 via-fuchsia-950 to-indigo-950",
}

const legalDocuments = [
  {
    title: "Security Architecture",
    source: "SECURITY.md",
    icon: ShieldCheck,
    content: securityMarkdown,
  },
  {
    title: "Commercial License Terms",
    source: "LICENSE-PRO.md",
    icon: Key,
    content: commercialLicenseMarkdown,
  },
  {
    title: "Privacy Terms, Pricing",
    source: "docs/legal/PRIVACY-TERMS-PRICING.md",
    icon: Database,
    content: privacyTermsPricingMarkdown,
  },
] as const

function LegalDocsSection() {
  return (
    <section className="min-w-0 space-y-3 rounded-md border border-white/10 bg-white/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">Legal & Security</Label>
        <Badge className="bg-white/10 text-gray-300">Offline docs</Badge>
      </div>
      <p className="text-xs text-gray-400">
        CredStore public code is AGPLv3-or-later. Pro and Enterprise features are governed by the commercial EULA.
        Vault data stays local; CredStore has no cloud vault and no master-key recovery.
      </p>
      <div className="space-y-2">
        {legalDocuments.map((document) => (
          <DocDropdown
            content={document.content}
            icon={<document.icon className="h-3 w-3" />}
            key={document.title}
            source={document.source}
            title={document.title}
          />
        ))}
      </div>
    </section>
  )
}

function UserManualSection() {
  return (
    <section className="min-w-0 space-y-3 rounded-md border border-white/10 bg-white/5 p-3 lg:col-span-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">User Manual</Label>
        <Badge className="bg-white/10 text-gray-300">Offline</Badge>
      </div>
      <DocDropdown
        content={userManualMarkdown}
        icon={<Settings className="h-3 w-3" />}
        source="docs/USER-MANUAL.md"
        title="User Manual"
        defaultOpen
        tall
      />
    </section>
  )
}

function DocDropdown({
  content,
  defaultOpen = false,
  icon,
  source,
  tall = false,
  title,
}: {
  content: string
  defaultOpen?: boolean
  icon: ReactNode
  source: string
  tall?: boolean
  title: string
}) {
  return (
    <details className="group min-w-0 rounded-md border border-white/10 bg-black/10 text-xs" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-gray-100">
        <span className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="truncate">{title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-[11px] text-gray-400">
          <span className="hidden font-mono sm:inline">{source}</span>
          <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="border-t border-white/10 px-3 py-3">
        <div
          className={
            tall
              ? "max-h-[220px] overflow-y-auto pr-2 sm:max-h-[320px]"
              : "max-h-[180px] overflow-y-auto pr-2 sm:max-h-[240px]"
          }
        >
          <MarkdownDocument content={content} />
        </div>
      </div>
    </details>
  )
}

type BiometricAvailability = {
  available: boolean
  code?: string
  message?: string
  biometryType?: BiometryType
  strongBiometryIsAvailable?: boolean
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

type SyncPairingPayload = {
  scheme: typeof CREDSTORE_DEEPLINK_SCHEME
  type: "credstore-sync-pair"
  version: 1
  sessionId: string
  otp: string
  checksum: string
  bytes: number
  selectedCount: number
  createdAt: string
  deviceId?: string
}

type ExpectedSyncPairing = Pick<SyncPairingPayload, "sessionId" | "otp" | "checksum" | "createdAt" | "deviceId"> | null

type CompactEncryptedPayload = {
  e: string
  i: string
  s?: string
}

type CompactKeySlot = {
  id: string
  t: KeySlot["type"]
  l: string
  n: boolean
  w?: CompactEncryptedPayload
  b?: BiometricKey
}

type CompactVaultRecord = {
  v: 2
  p: CompactEncryptedPayload
  k: CompactKeySlot[]
  c: string
  u: string
}

type BiometricUiState = {
  target: "login-fingerprint" | "login-face" | "register-fingerprint" | "register-face" | null
  phase: "idle" | "running" | "success"
  mode?: "login" | "register"
  label?: string
}

type SyncDoneState = {
  deviceName: string
  deviceId: string
} | null

type SettingsPanel = "settings" | "enterprise"

declare global {
  interface Window {
    credstoreWindow?: {
      minimize: () => Promise<void>
      maximize: () => Promise<void>
      close: () => Promise<void>
    }
    credstoreNative?: {
      biometric: CredStoreBiometricPlugin
      bluetooth?: {
        isAvailable: () => Promise<{ available: boolean; code?: string; message?: string }>
      }
      localSync?: CredStoreLocalSyncPlugin
    }
  }
}

const licensePublicKeyFragments = ["9zQJn5yYzZ", "5YkRP1SGIh", "lniKxkG5iK", "CWWMjlfkDm", "hm4"] as const

function getLicensePublicKeyBytes() {
  return base64UrlToBytes(licensePublicKeyFragments.join(""))
}

const TEST_LICENSE_TOKEN =
  "eyJhbGciOiJFZDI1NTE5IiwicGxhbiI6ImVudGVycHJpc2UiLCJraW5kIjoidGVzdCIsImxpY2Vuc2VJZCI6ImNyZWRzdG" +
  "9yZS10ZXN0LTIwMjYiLCJjb21wYW55IjoiTG9jYSBNYXJ0aW4gVGVzdCBMYWIiLCJidXllckVtYWlsIjoibG9jYWJveWZm" +
  "QGdtYWlsLmNvbSIsIm1heERldmljZXMiOjUwLCJtYXhVc2VycyI6NTAsImlzc3VlZEF0IjoiMjAyNi0wNy0xMVQwMzoxMD" +
  "ozMC4xODlaIiwiZmVhdHVyZXMiOlsicHJlbWl1bS1zeW5jIiwiZW1wbG95ZWUtcHJvZmlsZXMiLCJhZG1pbi1jb250cm9s" +
  "cyIsInZpc2liaWxpdHktY29udHJvbHMiLCJjdXN0b21pemF0aW9uLWZlZWRiYWNrIl19.pN0nUGWK8ull7tUqj_W2cQpRy" +
  "5hqlK-6sSncMeWcdrgkyFW79wjQmFfp31fuIt34QE7cqrbeHCJPDc_Psy_tBw"

const TRIAL_LICENSE_TOKEN =
  "eyJhbGciOiJFZDI1NTE5IiwicGxhbiI6ImVudGVycHJpc2UiLCJraW5kIjoidHJpYWwiLCJsaWNlbnNlSWQiOiJjcmVkc3" +
  "RvcmUtdHJpYWwtNS1kYXktZGVtbyIsImNvbXBhbnkiOiI1IERheSBUcmlhbCBEZW1vIiwiYnV5ZXJFbWFpbCI6InRyaWFs" +
  "QGV4YW1wbGUuY29tIiwibWF4RGV2aWNlcyI6NTAsIm1heFVzZXJzIjo1MCwiaXNzdWVkQXQiOiIyMDI2LTA3LTExVDAzOj" +
  "EwOjMwLjE4OVoiLCJleHBpcmVzQXQiOiIyMDI2LTA3LTE2VDAzOjEwOjMwLjE4OVoiLCJmZWF0dXJlcyI6WyJwcmVtaXVt" +
  "LXN5bmMiLCJlbXBsb3llZS1wcm9maWxlcyIsImFkbWluLWNvbnRyb2xzIiwidmlzaWJpbGl0eS1jb250cm9scyIsImN1c3" +
  "RvbWl6YXRpb24tZmVlZGJhY2siXX0.9m4wizGHgkdG6BymO6kS8rj-H3gMYfMyq9nNeupNGA9ZvCluCYMIpYFx6k1yl9z" +
  "CryQ0mHd4je5aDpF3FOrmBw"

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

function adminPasswordMeetsPolicy(value: string) {
  return value.length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value)
}

async function hashAdminPassword(password: string, salt = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(24)))) {
  const sourceKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), { name: "PBKDF2" }, false, [
    "deriveBits",
  ])
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: base64UrlToBytes(salt),
      iterations: 300000,
      hash: "SHA-256",
    },
    sourceKey,
    256,
  )

  return {
    salt,
    hash: bytesToBase64Url(new Uint8Array(bits)),
  }
}

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

function bytesToBase32(bytes: Uint8Array) {
  let bits = 0
  let value = 0
  let output = ""

  for (const byte of Array.from(bytes)) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += base32Alphabet[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }

  if (bits > 0) output += base32Alphabet[(value << (5 - bits)) & 31]
  return output
}

function base32ToBytes(value: string) {
  const clean = value.replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase()
  let bits = 0
  let buffer = 0
  const output: number[] = []

  for (const char of clean) {
    const index = base32Alphabet.indexOf(char)
    if (index < 0) throw new Error("Invalid authenticator secret")
    buffer = (buffer << 5) | index
    bits += 5
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255)
      bits -= 8
    }
  }

  return new Uint8Array(output)
}

function createTotpSecret() {
  return bytesToBase32(crypto.getRandomValues(new Uint8Array(20)))
}

function createTotpUri(secret: string, accountIdentity: string) {
  const label = encodeURIComponent(`CredStore:${accountIdentity.slice(0, 8) || "admin"}`)
  const issuer = encodeURIComponent("CredStore")
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`
}

async function generateTotp(secret: string, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 30000)
  const counterBytes = new ArrayBuffer(8)
  const view = new DataView(counterBytes)
  view.setUint32(4, counter)

  const key = await crypto.subtle.importKey("raw", base32ToBytes(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"])
  const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes))
  const offset = hmac[hmac.length - 1] & 15
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    1000000

  return code.toString().padStart(6, "0")
}

async function verifyTotp(secret: string, code: string) {
  const clean = code.replace(/\D/g, "")
  if (clean.length !== 6) return false
  const now = Date.now()
  const windows = [-30000, 0, 30000]
  for (const offset of windows) {
    if ((await generateTotp(secret, now + offset)) === clean) return true
  }
  return false
}

function compactEncryptedPayload(payload: EncryptedPayload): CompactEncryptedPayload {
  return {
    e: bytesToBase64Url(Uint8Array.from(payload.encrypted)),
    i: bytesToBase64Url(Uint8Array.from(payload.iv)),
    ...(payload.salt ? { s: payload.salt } : {}),
  }
}

function expandEncryptedPayload(payload: CompactEncryptedPayload): EncryptedPayload {
  return {
    encrypted: Array.from(base64UrlToBytes(payload.e)),
    iv: Array.from(base64UrlToBytes(payload.i)),
    ...(payload.s ? { salt: payload.s } : {}),
  }
}

function compactVaultRecord(vault: VaultRecord): CompactVaultRecord {
  return {
    v: 2,
    p: compactEncryptedPayload(vault.payload),
    k: vault.keySlots.map((slot) => ({
      id: slot.id,
      t: slot.type,
      l: slot.label,
      n: slot.enabled,
      ...(slot.wrappedKey ? { w: compactEncryptedPayload(slot.wrappedKey) } : {}),
      ...(slot.biometricKey ? { b: slot.biometricKey } : {}),
    })),
    c: vault.createdAt,
    u: vault.updatedAt,
  }
}

function expandVaultRecord(vault: CompactVaultRecord): VaultRecord {
  return {
    version: 2,
    payload: expandEncryptedPayload(vault.p),
    keySlots: vault.k.map((slot) => ({
      id: slot.id,
      type: slot.t,
      label: slot.l,
      enabled: slot.n,
      ...(slot.w ? { wrappedKey: expandEncryptedPayload(slot.w) } : {}),
      ...(slot.b ? { biometricKey: slot.b } : {}),
    })),
    createdAt: vault.c,
    updatedAt: vault.u,
  }
}

function checksumText(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16).padStart(8, "0")
}

function createSyncPayload(vault: VaultRecord) {
  const compactPayload = {
    scheme: CREDSTORE_DEEPLINK_SCHEME,
    type: "credstore-sync",
    v: 3,
    createdAt: new Date().toISOString(),
    vault: compactVaultRecord(vault),
  }

  return `${SYNC_QR_PREFIX}${bytesToBase64Url(gzipSync(strToU8(JSON.stringify(compactPayload))))}`
}

function createSyncPairingPayload(payload: string, selectedCount: number, deviceId?: string) {
  const otp = checksumText(payload).slice(0, 8).toUpperCase()
  const pairing: SyncPairingPayload = {
    scheme: CREDSTORE_DEEPLINK_SCHEME,
    type: "credstore-sync-pair",
    version: 1,
    sessionId: createId(),
    otp,
    checksum: checksumText(payload),
    bytes: payload.length,
    selectedCount,
    createdAt: new Date().toISOString(),
    ...(deviceId ? { deviceId } : {}),
  }

  return {
    code: otp,
    pairing,
    qrValue: `${SYNC_PAIRING_PREFIX}${encodePayload(pairing)}`,
  }
}

function decodeSyncPairingPayload(value: string): SyncPairingPayload {
  if (!value.startsWith(SYNC_PAIRING_PREFIX)) throw new Error("Invalid pairing QR")
  const pairing = decodePayload<SyncPairingPayload>(value.slice(SYNC_PAIRING_PREFIX.length))
  if (
    pairing.scheme !== CREDSTORE_DEEPLINK_SCHEME ||
    pairing.type !== "credstore-sync-pair" ||
    pairing.version !== 1 ||
    !pairing.sessionId ||
    !pairing.otp ||
    !pairing.checksum
  ) {
    throw new Error("Invalid pairing QR")
  }

  return pairing
}

function decodeSyncPayload(value: string): VaultRecord {
  if (value.startsWith(SYNC_QR_PREFIX)) {
    const raw = strFromU8(gunzipSync(base64UrlToBytes(value.slice(SYNC_QR_PREFIX.length))))
    const parsed = JSON.parse(raw) as {
      scheme?: string
      type?: string
      v?: number
      vault?: CompactVaultRecord
    }

    if (
      parsed.scheme !== CREDSTORE_DEEPLINK_SCHEME ||
      parsed.type !== "credstore-sync" ||
      parsed.v !== 3 ||
      !parsed.vault
    ) {
      throw new Error("Invalid sync payload")
    }

    const vault = expandVaultRecord(parsed.vault)
    if (!parseVault(JSON.stringify(vault))) throw new Error("Invalid sync payload")
    return vault
  }

  const parsed = decodePayload<{
    scheme?: string
    type?: string
    vault?: VaultRecord
  }>(value)

  const vault = parseVault(JSON.stringify(parsed.vault))

  if (parsed.scheme !== CREDSTORE_DEEPLINK_SCHEME || parsed.type !== "credstore-offline-sync" || !vault) {
    throw new Error("Invalid sync payload")
  }

  return vault
}

function mergeById<T extends { id: string; updatedAt?: string; lastSeenAt?: string }>(current: T[] = [], incoming: T[] = []) {
  const merged = new Map<string, T>()

  for (const item of current) merged.set(item.id, item)
  for (const item of incoming) {
    const existing = merged.get(item.id)
    const existingTime = existing?.updatedAt || existing?.lastSeenAt || ""
    const incomingTime = item.updatedAt || item.lastSeenAt || ""
    if (!existing || incomingTime >= existingTime) merged.set(item.id, item)
  }

  return Array.from(merged.values())
}

function mergeVaultData(current: VaultData, incoming: VaultData): VaultData {
  const currentNormalized = normalizeVaultData(current)
  const incomingNormalized = normalizeVaultData(incoming)
  const currentMetadata = currentNormalized.metadata
  const incomingMetadata = incomingNormalized.metadata

  return normalizeVaultData({
    credentials: mergeById(currentNormalized.credentials, incomingNormalized.credentials),
    metadata: {
      deviceId: currentMetadata?.deviceId || incomingMetadata?.deviceId || createId(),
      accountIdentity: currentMetadata?.accountIdentity || incomingMetadata?.accountIdentity || createId(),
      syncedDevices: mergeById(currentMetadata?.syncedDevices || [], incomingMetadata?.syncedDevices || []),
      license: currentMetadata?.license || incomingMetadata?.license,
    },
    profiles: mergeById(currentNormalized.profiles || [], incomingNormalized.profiles || []),
    roles: mergeById(currentNormalized.roles || [], incomingNormalized.roles || []),
  })
}

async function assertMonotonicLicenseClock() {
  const now = Date.now()
  const storedLastSeen = Number(await readStoredValue(LICENSE_CLOCK_STORAGE_KEY))

  if (Number.isFinite(storedLastSeen) && storedLastSeen > now + 120000) {
    throw new Error("System clock rollback detected. Restore the correct date and time to validate licenses.")
  }

  await writeStoredValue(LICENSE_CLOCK_STORAGE_KEY, String(Math.max(now, Number.isFinite(storedLastSeen) ? storedLastSeen : 0)))
}

function describeBiometricAvailability(result: BiometricAvailability) {
  if (result.available) {
    if (result.biometryType === BiometryType.FACE_ID || result.biometryType === BiometryType.FACE_AUTHENTICATION) {
      return "Face biometric unlock is available through the operating system."
    }
    if (result.biometryType === BiometryType.FINGERPRINT || result.biometryType === BiometryType.TOUCH_ID) {
      return "Fingerprint or Touch ID unlock is available through the operating system."
    }
    if (result.biometryType === BiometryType.MULTIPLE) return "Multiple biometric unlock methods are available."
    return "Biometric unlock is available through the operating system."
  }

  switch (result.code) {
    case "NO_HARDWARE":
      return "This device does not report biometric hardware."
    case "NONE_ENROLLED":
      return "No fingerprint or face biometric is enrolled on this device."
    case "UNAVAILABLE":
      return "Biometric hardware is currently unavailable."
    case "SECURITY_UPDATE_REQUIRED":
      return "Android requires a security update before biometric unlock can be used."
    case "UNSUPPORTED":
      return "This OS version does not support the required biometric prompt."
    case "PLUGIN_UNAVAILABLE":
      return "Native biometric plugin is unavailable in this build."
    default:
      return result.message || "Biometric unlock is not available on this device."
  }
}

function biometricLabelForResult(result: BiometricAvailability) {
  if (result.biometryType === BiometryType.FACE_ID || result.biometryType === BiometryType.FACE_AUTHENTICATION) return "Face"
  if (result.biometryType === BiometryType.TOUCH_ID) return "Touch ID"
  if (result.biometryType === BiometryType.FINGERPRINT) return "Fingerprint"
  return "Biometric"
}

function biometricTypeAllowed(type: "fingerprint" | "face", result: BiometricAvailability) {
  if (type === "face" && hasCameraFaceSupport()) return true
  if (!result.available) return false
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    return type === "fingerprint"
  }
  if (result.biometryType === BiometryType.MULTIPLE || result.biometryType === undefined) return true
  if (type === "face") return result.biometryType === BiometryType.FACE_ID || result.biometryType === BiometryType.FACE_AUTHENTICATION
  return result.biometryType === BiometryType.FINGERPRINT || result.biometryType === BiometryType.TOUCH_ID
}

function isAndroidNativePlatform() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android"
}

function hasCameraFaceSupport() {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia)
}

async function getBiometricAvailability(): Promise<BiometricAvailability> {
  if (Capacitor.isNativePlatform()) {
    const platform = Capacitor.getPlatform()

    if (platform === "android") {
      try {
        const result = await CredStoreBiometric.isAvailable()
        return result.available
          ? {
              ...result,
              message: result.message || "Strong Android biometric unlock is available.",
            }
          : {
              ...result,
              message:
                result.message ||
                "CredStore requires Android Class 3 strong biometrics for encrypted vault-key unlock.",
            }
      } catch {
        return { available: false, code: "PLUGIN_UNAVAILABLE" }
      }
    }

    try {
      const result = await NativeBiometric.isAvailable({ useFallback: false })
      const packageResult = {
        available: result.isAvailable,
        code: result.errorCode ? String(result.errorCode) : result.isAvailable ? "AVAILABLE" : "UNAVAILABLE",
        message: result.isAvailable ? "Native biometric unlock is available." : "Native biometric unlock is unavailable.",
        biometryType: result.biometryType,
        strongBiometryIsAvailable: result.strongBiometryIsAvailable,
      }
      if (packageResult.available || platform !== "android") return packageResult
    } catch {
      // Fall through to the custom plugin.
    }

    try {
      return await CredStoreBiometric.isAvailable()
    } catch {
      return { available: false, code: "PLUGIN_UNAVAILABLE" }
    }
  }

  if (typeof window !== "undefined" && window.credstoreNative?.biometric) {
    return window.credstoreNative.biometric.isAvailable()
  }

  return { available: false, code: "PLUGIN_UNAVAILABLE", message: "Native biometric support is unavailable in this build." }
}

async function deriveCameraFaceKey(template: string) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`CredStore camera face:${template}`),
    "PBKDF2",
    false,
    ["deriveKey"],
  )
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode("CredStore camera face unlock v1"),
      iterations: 210000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

async function createCameraFaceSecret(secret: string): Promise<BiometricKey> {
  const template = await captureCameraFaceTemplate("Register Face")
  const key = await deriveCameraFaceKey(template.hash)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(secret)))
  return {
    platform: "camera-face",
    encrypted: bytesToBase64Url(encrypted),
    iv: encodePayload({
      template: template.hash,
      iv: bytesToBase64Url(iv),
      threshold: template.threshold,
      createdAt: new Date().toISOString(),
    }),
  }
}

async function getCameraFaceSecret(biometricKey: BiometricKey): Promise<string> {
  const metadata = decodePayload<{ template?: string; iv?: string; threshold?: number }>(biometricKey.iv)
  if (!metadata.template || !metadata.iv) throw new Error("Camera face key is invalid. Register Face again.")

  const current = await captureCameraFaceTemplate("Scan Face")
  const distance = hammingDistance(metadata.template, current.hash)
  const threshold = metadata.threshold ?? current.threshold
  if (distance > threshold) {
    throw new Error("Face was not recognized. Improve lighting, center your face, and try again.")
  }

  const key = await deriveCameraFaceKey(metadata.template)
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(metadata.iv) },
    key,
    base64UrlToBytes(biometricKey.encrypted),
  )
  return new TextDecoder().decode(decrypted)
}

async function captureCameraFaceTemplate(title: string): Promise<{ hash: string; threshold: number }> {
  if (!hasCameraFaceSupport()) throw new Error("Camera access is unavailable on this device.")

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  })

  const overlay = document.createElement("div")
  overlay.className = "fixed inset-0 z-[90] grid place-items-center bg-black/80 p-4 backdrop-blur-sm"
  overlay.innerHTML = `
    <div class="w-full max-w-sm rounded-lg border border-white/15 bg-slate-950/95 p-4 text-center text-white shadow-2xl">
      <div class="mb-3">
        <h2 class="text-xl font-bold">${title}</h2>
        <p class="mt-1 text-sm text-slate-300">Center your face in the frame. CredStore stores a local camera template only.</p>
      </div>
      <div class="relative overflow-hidden rounded-lg border border-cyan-300/30 bg-black">
        <video autoplay muted playsinline class="h-72 w-full object-cover"></video>
        <div class="pointer-events-none absolute inset-8 rounded-[42%] border-2 border-cyan-300/80 shadow-[0_0_40px_rgba(34,211,238,0.45)]"></div>
        <div class="pointer-events-none absolute left-6 right-6 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-cyan-300 shadow-[0_0_22px_rgba(103,232,249,0.9)]"></div>
      </div>
      <p class="mt-3 text-xs text-slate-300">Scanning face locally...</p>
    </div>
  `
  document.body.appendChild(overlay)
  const video = overlay.querySelector("video") as HTMLVideoElement
  video.srcObject = stream

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => {
        video.play().then(() => resolve()).catch(reject)
      }
      video.onerror = () => reject(new Error("Camera preview failed."))
    })
    await new Promise((resolve) => window.setTimeout(resolve, 900))

    const canvas = document.createElement("canvas")
    canvas.width = 160
    canvas.height = 160
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) throw new Error("Camera template generation failed.")

    let sourceBox: FaceDetectorBox | null = null
    if (typeof FaceDetector !== "undefined") {
      try {
        const detector = new FaceDetector({ fastMode: true, maxDetectedFaces: 1 })
        const faces = await detector.detect(video)
        sourceBox = faces[0]?.boundingBox || null
      } catch {
        sourceBox = null
      }
    }

    const videoWidth = video.videoWidth || 640
    const videoHeight = video.videoHeight || 480
    const fallbackSize = Math.min(videoWidth, videoHeight) * 0.68
    const box = sourceBox || {
      x: (videoWidth - fallbackSize) / 2,
      y: (videoHeight - fallbackSize) / 2,
      width: fallbackSize,
      height: fallbackSize,
    }
    const padding = Math.min(box.width, box.height) * 0.22
    const sx = Math.max(0, box.x - padding)
    const sy = Math.max(0, box.y - padding)
    const sw = Math.min(videoWidth - sx, box.width + padding * 2)
    const sh = Math.min(videoHeight - sy, box.height + padding * 2)
    context.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    const hash = perceptualHash(context.getImageData(0, 0, canvas.width, canvas.height))
    return { hash, threshold: 54 }
  } finally {
    stream.getTracks().forEach((track) => track.stop())
    overlay.remove()
  }
}

function perceptualHash(image: ImageData) {
  const cells = 16
  const cellWidth = image.width / cells
  const cellHeight = image.height / cells
  const values: number[] = []

  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      let total = 0
      let count = 0
      const startX = Math.floor(x * cellWidth)
      const endX = Math.floor((x + 1) * cellWidth)
      const startY = Math.floor(y * cellHeight)
      const endY = Math.floor((y + 1) * cellHeight)
      for (let py = startY; py < endY; py += 1) {
        for (let px = startX; px < endX; px += 1) {
          const index = (py * image.width + px) * 4
          total += image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114
          count += 1
        }
      }
      values.push(total / Math.max(1, count))
    }
  }

  const sorted = [...values].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)] || 0
  let bits = ""
  for (const value of values) bits += value >= median ? "1" : "0"

  let hex = ""
  for (let index = 0; index < bits.length; index += 4) {
    hex += Number.parseInt(bits.slice(index, index + 4), 2).toString(16)
  }
  return hex
}

function hammingDistance(left: string, right: string) {
  const length = Math.min(left.length, right.length)
  let distance = Math.abs(left.length - right.length) * 4
  for (let index = 0; index < length; index += 1) {
    const a = Number.parseInt(left[index], 16)
    const b = Number.parseInt(right[index], 16)
    let xor = a ^ b
    while (xor) {
      distance += xor & 1
      xor >>= 1
    }
  }
  return distance
}

async function createBiometricSecret(slotId: string, secret: string): Promise<BiometricKey> {
  if (Capacitor.isNativePlatform()) {
    if (isAndroidNativePlatform()) {
      const protectedSecret = await CredStoreBiometric.createSecret({ slotId, secret })
      return { platform: "android-keystore", encrypted: protectedSecret.encrypted, iv: protectedSecret.iv }
    }

    try {
      await NativeBiometric.setData({
        key: `credstore-vault-key-${slotId}`,
        value: secret,
        accessControl: AccessControl.BIOMETRY_ANY,
        authValidityDuration: 0,
        title: "Save CredStore biometric key",
        negativeButtonText: "Cancel",
      })
      return { platform: "capgo-secure-data", encrypted: slotId, iv: "capgo-secure-data" }
    } catch {
      const protectedSecret = await CredStoreBiometric.createSecret({ slotId, secret })
      return { platform: "android-keystore", encrypted: protectedSecret.encrypted, iv: protectedSecret.iv }
    }
  }

  if (typeof window !== "undefined" && window.credstoreNative?.biometric) {
    const protectedSecret = await window.credstoreNative.biometric.createSecret({ slotId, secret })
    return { platform: "electron-safe-storage", encrypted: protectedSecret.encrypted, iv: protectedSecret.iv }
  }

  throw new Error("Biometric storage is not available")
}

async function getBiometricSecret(slotId: string, biometricKey: BiometricKey): Promise<string> {
  if (biometricKey.platform === "camera-face") {
    return getCameraFaceSecret(biometricKey)
  }

  if (biometricKey.platform === "electron-safe-storage") {
    if (!window.credstoreNative?.biometric) throw new Error("Desktop biometric bridge unavailable")
    const result = await window.credstoreNative.biometric.getSecret({
      slotId,
      encrypted: biometricKey.encrypted,
      iv: biometricKey.iv,
    })
    return result.secret
  }

  if (biometricKey.platform === "capgo-secure-data") {
    if (isAndroidNativePlatform()) {
      throw new Error("This Android biometric key uses an older provider. Remove it and register biometric unlock again.")
    }

    const result = await NativeBiometric.getSecureData({
      key: `credstore-vault-key-${slotId}`,
      reason: "Unlock your CredStore vault",
      title: "Unlock CredStore",
      subtitle: "Confirm your fingerprint or face authentication.",
      negativeButtonText: "Cancel",
    })
    return result.value
  }

  const result = await CredStoreBiometric.getSecret({
    slotId,
    encrypted: biometricKey.encrypted,
    iv: biometricKey.iv,
  })
  return result.secret
}

async function scanQrFromVideo(video: HTMLVideoElement, timeoutMs = 30000) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera is not available in this build.")
  }

  const { BrowserQRCodeReader } = await import("@zxing/browser")
  const reader = new BrowserQRCodeReader(undefined, {
    delayBetweenScanAttempts: 250,
    delayBetweenScanSuccess: 250,
  })

  return await new Promise<string>((resolve, reject) => {
    let controls: { stop: () => void } | null = null
    let settled = false

    const stop = () => {
      controls?.stop()
      video.pause()
      video.removeAttribute("src")
      video.srcObject = null
    }

    const finish = (value: string) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      stop()
      resolve(value)
    }

    const fail = (error: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      stop()
      reject(error)
    }

    const timeout = window.setTimeout(() => fail(new Error("No QR code detected. Try again.")), timeoutMs)

    reader
      .decodeFromConstraints({ video: { facingMode: { ideal: "environment" } } }, video, (result, _error, scannerControls) => {
        controls = scannerControls
        const text = result?.getText()
        if (text) finish(text)
      })
      .then((scannerControls) => {
        controls = scannerControls
      })
      .catch((error: Error) => fail(error))
  })
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

function BiometricCeremony({ state }: { state: BiometricUiState }) {
  if (!state.target || state.phase === "idle") return null

  const isFace = state.target.includes("face")
  const title =
    state.phase === "success"
      ? `${state.label || (isFace ? "Face" : "Fingerprint")} ${state.mode === "register" ? "registered" : "accepted"}`
      : `${state.mode === "register" ? "Register" : "Scan"} ${state.label || (isFace ? "face" : "fingerprint")}`
  const detail =
    state.phase === "success"
      ? "CredStore received a verified result from the operating system."
      : "Use the secure biometric prompt shown by your operating system."

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-lg border border-white/15 bg-slate-950/95 p-6 text-center text-white shadow-2xl">
        <div className="mx-auto mb-5 grid h-48 w-48 place-items-center rounded-full border border-blue-300/30 bg-blue-950/30 shadow-[0_0_60px_rgba(59,130,246,0.25)]">
          {state.phase === "success" ? (
            <div className="grid h-28 w-28 place-items-center rounded-full border-2 border-emerald-300 bg-emerald-400/10">
              <CheckCircle2 className="h-16 w-16 animate-pulse text-emerald-300" />
            </div>
          ) : isFace ? (
            <div className="relative h-36 w-36">
              <div className="absolute inset-2 rounded-[42%] border border-blue-300/70 shadow-[0_0_35px_rgba(34,211,238,0.35)]" />
              <div className="absolute inset-6 rounded-[44%] border border-cyan-300/25" />
              <div className="absolute left-8 right-8 top-12 h-2 rounded-full bg-blue-300/80" />
              <div className="absolute bottom-12 left-12 right-12 h-1 rounded-full bg-blue-300/70" />
              <div className="absolute left-3 top-3 h-9 w-9 rounded-tl-lg border-l-4 border-t-4 border-white" />
              <div className="absolute right-3 top-3 h-9 w-9 rounded-tr-lg border-r-4 border-t-4 border-white" />
              <div className="absolute bottom-3 left-3 h-9 w-9 rounded-bl-lg border-b-4 border-l-4 border-white" />
              <div className="absolute bottom-3 right-3 h-9 w-9 rounded-br-lg border-b-4 border-r-4 border-white" />
              <div className="absolute left-5 right-5 top-1/2 h-1 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_24px_rgba(103,232,249,0.9)]" />
              <div className="absolute left-1/2 top-8 h-20 w-px -translate-x-1/2 bg-cyan-300/40" />
              <div className="absolute left-8 top-1/2 h-px w-20 -translate-y-1/2 bg-cyan-300/40" />
            </div>
          ) : (
            <div className="relative h-36 w-28">
              <div className="absolute inset-0 animate-ping rounded-full border border-blue-300/25" />
              <Fingerprint className="absolute inset-0 h-32 w-24 text-white/90" />
              <div className="absolute bottom-3 left-1/2 h-28 w-1 -translate-x-1/2 animate-pulse rounded-full bg-blue-400 shadow-[0_0_24px_rgba(96,165,250,0.9)]" />
            </div>
          )}
        </div>
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="mt-2 text-sm text-gray-300">{detail}</p>
      </div>
    </div>
  )
}

function CredentialCard({
  credential,
  ownerLabel,
  visibleFields,
  selected,
  selectionMode,
  onToggleField,
  onCopy,
  onEdit,
  onDelete,
  onToggleSelected,
  onLongPress,
}: {
  credential: Credential
  ownerLabel?: string
  visibleFields: Set<string>
  selected: boolean
  selectionMode: boolean
  onToggleField: (fieldId: string) => void
  onCopy: (text: string) => void
  onEdit: () => void
  onDelete: () => void
  onToggleSelected: () => void
  onLongPress: () => void
}) {
  const longPressTimerRef = useRef<number | null>(null)
  const clearLongPress = () => {
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = null
  }

  return (
    <Card
      onPointerDown={() => {
        clearLongPress()
        longPressTimerRef.current = window.setTimeout(onLongPress, 450)
      }}
      onPointerUp={clearLongPress}
      onPointerLeave={clearLongPress}
      onPointerCancel={clearLongPress}
      onContextMenu={(event) => {
        event.preventDefault()
        clearLongPress()
        if (selectionMode) onToggleSelected()
        else onLongPress()
      }}
      className={`border-white/10 shadow-sm hover:bg-white/10 ${
        selected ? "bg-blue-500/20 ring-2 ring-blue-300/60" : "bg-white/5"
      }`}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          {selectionMode && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onToggleSelected}
              className="h-6 w-6 flex-shrink-0 p-0 text-blue-200 hover:bg-white/10"
            >
              {selected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            </Button>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              {categoryIcon(credential.category)}
              <h3 className="truncate text-sm font-medium text-white">{credential.title}</h3>
              <Badge variant="secondary" className="border-white/30 bg-white/20 px-1 py-0 text-xs text-white">
                {credential.category}
              </Badge>
              {ownerLabel && (
                <Badge variant="secondary" className="border-emerald-300/30 bg-emerald-500/15 px-1 py-0 text-xs text-emerald-100">
                  {ownerLabel}
                </Badge>
              )}
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
          <div className="flex flex-shrink-0 flex-col gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={onEdit}
              className="h-6 w-6 p-0 text-blue-200 hover:bg-blue-500/10 hover:text-blue-100"
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              className="h-6 w-6 p-0 text-red-400 hover:bg-red-500/10 hover:text-red-300"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
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
  const [selectedCredentialIds, setSelectedCredentialIds] = useState<Set<string>>(new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingCredentialId, setEditingCredentialId] = useState<string | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsPanel, setSettingsPanel] = useState<SettingsPanel>("settings")
  const [isSyncOpen, setIsSyncOpen] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [theme, setTheme] = useState<ThemeName>("indigo")
  const [newMasterKey, setNewMasterKey] = useState("")
  const [newMasterKeyLabel, setNewMasterKeyLabel] = useState("Backup password")
  const [syncCode, setSyncCode] = useState("")
  const [syncMode, setSyncMode] = useState<"client" | "receiver">("client")
  const [syncPayload, setSyncPayload] = useState("")
  const [syncPairingQr, setSyncPairingQr] = useState("")
  const [expectedSyncPairing, setExpectedSyncPairing] = useState<ExpectedSyncPairing>(null)
  const [bluetoothDevices, setBluetoothDevices] = useState<CredStoreBluetoothDevice[]>([])
  const [bluetoothMessage, setBluetoothMessage] = useState("")
  const [isBluetoothReceiving, setIsBluetoothReceiving] = useState(false)
  const [syncOtpInput, setSyncOtpInput] = useState("")
  const [syncMessage, setSyncMessage] = useState("")
  const [vaultData, setVaultData] = useState<VaultData>(normalizeVaultData(null))
  const [licenseToken, setLicenseToken] = useState("")
  const [licenseMessage, setLicenseMessage] = useState("")
  const [activeLicense, setActiveLicense] = useState<LicenseRecord | null>(null)
  const [newProfileName, setNewProfileName] = useState("")
  const [activeProfileId, setActiveProfileId] = useState("")
  const [newGroupName, setNewGroupName] = useState("")
  const [selectedGroupId, setSelectedGroupId] = useState("")
  const [selectedVisibilityCredentialId, setSelectedVisibilityCredentialId] = useState("")
  const [adminPassword, setAdminPassword] = useState("")
  const [adminAuthenticated, setAdminAuthenticated] = useState(false)
  const [adminAuthMessage, setAdminAuthMessage] = useState("")
  const [adminAuthenticatorSecret, setAdminAuthenticatorSecret] = useState("")
  const [adminAuthenticatorCode, setAdminAuthenticatorCode] = useState("")
  const [unlockDelayUntil, setUnlockDelayUntil] = useState(0)
  const [failedUnlocks, setFailedUnlocks] = useState(0)
  const [biometricMessage, setBiometricMessage] = useState("")
  const [biometricUi, setBiometricUi] = useState<BiometricUiState>({ target: null, phase: "idle" })
  const [syncDone, setSyncDone] = useState<SyncDoneState>(null)
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
  const nativeBiometricLabel = biometricLabelForResult(biometricAvailability)
  const canUseFingerprint = biometricTypeAllowed("fingerprint", biometricAvailability)
  const canUseFace = hasCameraFaceSupport() || biometricTypeAllowed("face", biometricAvailability)
  const savedFingerprintSlot = useMemo(
    () => vaultRecord?.keySlots.find((slot) => slot.enabled && slot.type === "fingerprint" && slot.biometricKey) || null,
    [vaultRecord],
  )
  const savedFaceSlot = useMemo(
    () => vaultRecord?.keySlots.find((slot) => slot.enabled && slot.type === "face" && slot.biometricKey) || null,
    [vaultRecord],
  )
  const biometricRegistrationHint = biometricAvailable
    ? "Fingerprint uses the operating system. Face uses a local camera enrollment when hardware Face ID is unavailable."
    : hasCameraFaceSupport()
      ? "Face unlock is available through the camera. Fingerprint requires supported biometric hardware."
      : describeBiometricAvailability(biometricAvailability)
  const maxSyncDevices = activeLicense?.maxDevices || FREE_SYNC_DEVICE_LIMIT
  const syncDeviceCount = vaultData.metadata?.syncedDevices.length || 1
  const syncLimitLabel = activeLicense
    ? `${activeLicense.kind === "trial" ? "Trial" : "Enterprise"} sync limit: ${syncDeviceCount}/${maxSyncDevices} devices.`
    : `Free edition sync limit: ${syncDeviceCount}/${FREE_SYNC_DEVICE_LIMIT} devices.`
  const adminProfile = vaultData.profiles?.find((profile) =>
    vaultData.roles?.some((role) => role.id === profile.roleId && role.canManageProfiles),
  )
  const activeProfile = vaultData.profiles?.find((profile) => profile.id === activeProfileId) || adminProfile || vaultData.profiles?.[0]
  const activeProfileGroups = useMemo(
    () => (activeProfile ? (vaultData.groups || []).filter((group) => group.profileIds.includes(activeProfile.id)) : []),
    [activeProfile, vaultData.groups],
  )
  const selectedVisibilityCredential =
    credentials.find((credential) => credential.id === selectedVisibilityCredentialId) || credentials[0] || null
  const adminAuthLockoutRemaining = Math.max(0, (vaultData.adminAuth?.lockoutUntil || 0) - Date.now())
  const isAdminAuthLocked = adminAuthLockoutRemaining > 0
  const adminAuthenticatorUri = adminAuthenticatorSecret
    ? createTotpUri(adminAuthenticatorSecret, vaultData.metadata?.accountIdentity || "admin")
    : ""
  const selectedCount = selectedCredentialIds.size

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

  useEffect(() => {
    const fallbackProfileId = adminProfile?.id || vaultData.profiles?.[0]?.id || ""
    if (!activeProfileId && fallbackProfileId) {
      setActiveProfileId(fallbackProfileId)
      return
    }

    if (activeProfileId && !(vaultData.profiles || []).some((profile) => profile.id === activeProfileId)) {
      setActiveProfileId(fallbackProfileId)
    }
  }, [activeProfileId, adminProfile?.id, vaultData.profiles])

  useEffect(() => {
    if (!selectedVisibilityCredentialId && credentials[0]) {
      setSelectedVisibilityCredentialId(credentials[0].id)
      return
    }

    if (selectedVisibilityCredentialId && !credentials.some((credential) => credential.id === selectedVisibilityCredentialId)) {
      setSelectedVisibilityCredentialId(credentials[0]?.id || "")
    }
  }, [credentials, selectedVisibilityCredentialId])

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
    setSelectedCredentialIds(new Set())
    setSelectionMode(false)
    setHasError(false)
    setUnlockDelayUntil(0)
    setFailedUnlocks(0)
    setDraft(createDraft())
    setSyncPayload("")
    setAdminAuthenticated(false)
    setAdminPassword("")
    setAdminAuthMessage("")
    setActiveProfileId("")
    receivedSyncFramesRef.current = {}
  }, [])

  useEffect(() => {
    const boot = async () => {
      const storedTheme = await readStoredValue(THEME_STORAGE_KEY)
      if (storedTheme && storedTheme in THEMES) setTheme(storedTheme as ThemeName)
      const storedVaultRecord = parseVault(await readStoredValue(VAULT_STORAGE_KEY))
      setHasVault(Boolean(storedVaultRecord))
      setVaultRecord(storedVaultRecord)

      const storedInstallationId = await readStoredValue(INSTALLATION_ID_STORAGE_KEY)
      const nextInstallationId = storedInstallationId || createId()
      if (!storedInstallationId) await writeStoredValue(INSTALLATION_ID_STORAGE_KEY, nextInstallationId)
      setInstallationId(nextInstallationId)

      const storedLockout = Number(await readStoredValue(LOCKOUT_STORAGE_KEY))
      if (Number.isFinite(storedLockout) && storedLockout > Date.now()) {
        setUnlockDelayUntil(storedLockout)
      }

      try {
        const result = await getBiometricAvailability()
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
    if (isLocked || !activeLicense) return

    const updateLicenseClock = () => {
      writeStoredValue(LICENSE_CLOCK_STORAGE_KEY, String(Date.now())).catch(() => {
        // Best effort: the next license validation still checks the stored timestamp.
      })
    }

    updateLicenseClock()
    const interval = window.setInterval(updateLicenseClock, 60000)
    return () => window.clearInterval(interval)
  }, [activeLicense, isLocked])

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
      const target = type === "fingerprint" ? "login-fingerprint" : "login-face"
      const label = type === "face" ? "Face" : nativeBiometricLabel
      if (type !== "face" && !biometricAvailable) {
        setBiometricMessage(describeBiometricAvailability(biometricAvailability))
        setBiometricUi({ target: null, phase: "idle" })
        return
      }
      if (!biometricTypeAllowed(type, biometricAvailability)) {
        setBiometricMessage(`${type === "face" ? "Face unlock" : "Fingerprint unlock"} is not reported by this device.`)
        setBiometricUi({ target: null, phase: "idle" })
        return
      }

      try {
        const storedVault = parseVault(await readStoredValue(VAULT_STORAGE_KEY))
        const slot = storedVault?.keySlots.find(
          (item) => item.enabled && item.type === type && item.biometricKey,
        )

        if (!storedVault || !slot?.biometricKey) {
          const methodName = type === "fingerprint" ? "fingerprint" : "face"
          const registerAction = type === "fingerprint" ? "Register Fingerprint" : "Register Face"
          setBiometricMessage(
            `No ${methodName} master key is registered. Unlock with your master key, open Settings, then tap ${registerAction}.`,
          )
          setBiometricUi({ target: null, phase: "idle" })
          return
        }

        if (type !== "face" || slot.biometricKey.platform !== "camera-face") {
          setBiometricUi({ target, phase: "running", mode: "login", label })
        }
        const secret = await getBiometricSecret(slot.id, slot.biometricKey)

        await unlockWithVaultKey(storedVault, base64ToBytes(secret))
        setBiometricUi({ target, phase: "success", mode: "login", label })
        window.setTimeout(() => setBiometricUi({ target: null, phase: "idle" }), 900)
      } catch (error) {
        setBiometricMessage(error instanceof Error ? error.message : "Biometric unlock failed.")
        setBiometricUi({ target: null, phase: "idle" })
      }
    },
    [biometricAvailability, biometricAvailable, nativeBiometricLabel, unlockWithVaultKey],
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
      ownerProfileId: draft.ownerProfileId || activeProfile?.id || adminProfile?.id,
      visibleToProfileIds: draft.visibleToProfileIds || [],
      visibleToGroupIds: draft.visibleToGroupIds || [],
      createdAt: now,
      updatedAt: now,
    }
    const nextCredentials = [...credentials, credential]
    setCredentials(nextCredentials)
    await persistVault(nextCredentials)
    setDraft(createDraft())
    setIsAddDialogOpen(false)
  }, [activeProfile?.id, adminProfile?.id, credentials, draft, persistVault])

  const beginEditCredential = useCallback((credential: Credential) => {
    setEditingCredentialId(credential.id)
    setDraft({
      title: credential.title,
      category: credential.category,
      fields: credential.fields.map((field) => ({ ...field })),
      notes: credential.notes || "",
      ownerProfileId: credential.ownerProfileId || activeProfile?.id || adminProfile?.id || "",
      visibleToProfileIds: credential.visibleToProfileIds || [],
      visibleToGroupIds: credential.visibleToGroupIds || [],
    })
    setIsAddDialogOpen(true)
  }, [activeProfile?.id, adminProfile?.id])

  const closeCredentialEditor = useCallback((open: boolean) => {
    setIsAddDialogOpen(open)
    if (!open) {
      setEditingCredentialId(null)
      setDraft(createDraft())
    }
  }, [])

  const saveCredential = useCallback(async () => {
    if (!editingCredentialId) {
      await addCredential()
      return
    }

    const fields = draft.fields
      .map((field) => ({
        ...field,
        key: sanitizeText(field.key, 80).trim(),
        value: sanitizeText(field.value, 2000).trim(),
      }))
      .filter((field) => field.key && field.value)

    const title = sanitizeText(draft.title, 120).trim()
    if (!title || fields.length === 0) return

    const nextCredentials = credentials.map((credential) =>
      credential.id === editingCredentialId
        ? {
            ...credential,
            title,
            category: draft.category,
            fields,
            notes: sanitizeText(draft.notes, 5000).trim(),
            ownerProfileId: draft.ownerProfileId || credential.ownerProfileId,
            visibleToProfileIds: draft.visibleToProfileIds || [],
            visibleToGroupIds: draft.visibleToGroupIds || [],
            updatedAt: new Date().toISOString(),
          }
        : credential,
    )

    setCredentials(nextCredentials)
    await persistVault(nextCredentials)
    closeCredentialEditor(false)
  }, [addCredential, closeCredentialEditor, credentials, draft, editingCredentialId, persistVault])

  const deleteCredential = useCallback(
    async (id: string) => {
      const nextCredentials = credentials.filter((credential) => credential.id !== id)
      setCredentials(nextCredentials)
      await persistVault(nextCredentials)
    },
    [credentials, persistVault],
  )

  const toggleCredentialSelected = useCallback((id: string) => {
    setSelectedCredentialIds((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      setSelectionMode(next.size > 0)
      return next
    })
  }, [])

  const enterSelectionMode = useCallback((id: string) => {
    setSelectionMode(true)
    setSelectedCredentialIds((previous) => new Set(previous).add(id))
  }, [])

  const clearSelection = useCallback(() => {
    setSelectionMode(false)
    setSelectedCredentialIds(new Set())
  }, [])

  const deleteSelectedCredentials = useCallback(async () => {
    if (!selectedCredentialIds.size) return
    const nextCredentials = credentials.filter((credential) => !selectedCredentialIds.has(credential.id))
    setCredentials(nextCredentials)
    await persistVault(nextCredentials)
    clearSelection()
  }, [clearSelection, credentials, persistVault, selectedCredentialIds])

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

      const slotId = createId()
      const target = type === "fingerprint" ? "register-fingerprint" : "register-face"
      const displayLabel = type === "face" ? "Face" : nativeBiometricLabel
      const label = `${displayLabel} master key`

      if (type !== "face" && !biometricAvailable) {
        setBiometricMessage(describeBiometricAvailability(biometricAvailability))
        setBiometricUi({ target: null, phase: "idle" })
        return
      }
      if (!biometricTypeAllowed(type, biometricAvailability)) {
        setBiometricMessage(`${type === "face" ? "Face unlock" : "Fingerprint unlock"} is not reported by this device.`)
        setBiometricUi({ target: null, phase: "idle" })
        return
      }

      try {
        if (type !== "face") {
          setBiometricUi({ target, phase: "running", mode: "register", label: displayLabel })
        }
        const biometricKey =
          type === "face" ? await createCameraFaceSecret(bytesToBase64(vaultKey)) : await createBiometricSecret(slotId, bytesToBase64(vaultKey))
        const nextRecord: VaultRecord = {
          ...vaultRecord,
          keySlots: [
            ...vaultRecord.keySlots,
            {
              id: slotId,
              type,
              label,
              enabled: true,
              biometricKey,
            },
          ],
        }
        setVaultRecord(nextRecord)
        await persistVault(credentials, nextRecord, vaultKey)
        setBiometricMessage(`${label} saved.`)
        setBiometricUi({ target, phase: "success", mode: "register", label: displayLabel })
        window.setTimeout(() => setBiometricUi({ target: null, phase: "idle" }), 900)
      } catch (error) {
        setBiometricMessage(error instanceof Error ? error.message : "Biometric registration failed.")
        setBiometricUi({ target: null, phase: "idle" })
      }
    },
    [biometricAvailability, biometricAvailable, credentials, nativeBiometricLabel, persistVault, vaultKey, vaultRecord],
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

  const createSyncCode = useCallback(async () => {
    if (!vaultRecord || !vaultKey) return
    setSyncDone(null)
    const deviceCount = vaultData.metadata?.syncedDevices.length || 1
    if (deviceCount >= maxSyncDevices) {
      setSyncMessage(`Device sync limit reached (${deviceCount}/${maxSyncDevices}). Add an enterprise license to sync more devices.`)
      return
    }

    let sourceRecord = vaultRecord
    if (selectedCredentialIds.size > 0) {
      const selectedVaultData = normalizeVaultData({
        ...vaultData,
        credentials: vaultData.credentials.filter((credential) => selectedCredentialIds.has(credential.id)),
      })
      sourceRecord = {
        ...vaultRecord,
        payload: await encryptWithKey(JSON.stringify(selectedVaultData satisfies VaultData), await importVaultKey(vaultKey)),
        updatedAt: new Date().toISOString(),
      }
    }

    const nextSyncPayload = createSyncPayload(sourceRecord)
    const pairing = createSyncPairingPayload(
      nextSyncPayload,
      selectedCredentialIds.size,
      vaultData.metadata?.deviceId || installationId,
    )
    setSyncPayload(nextSyncPayload)
    setSyncPairingQr(pairing.qrValue)
    setSyncCode(pairing.code)
    setBluetoothDevices([])
    setBluetoothMessage("")
    setSyncMessage(
      selectedCredentialIds.size > 0
        ? `Pairing QR generated for ${selectedCredentialIds.size} selected item(s). Start the receiver and send over local transport.`
        : "Pairing QR generated. Start the receiver and send the encrypted payload over LAN/Bluetooth local transport.",
    )
  }, [installationId, maxSyncDevices, selectedCredentialIds, vaultData, vaultKey, vaultRecord])

  useEffect(() => {
    if (!isSyncOpen || syncMode !== "client" || syncPairingQr) return
    createSyncCode().catch((error: Error) => {
      setSyncMessage(error.message || "Sync QR generation failed.")
    })
  }, [createSyncCode, isSyncOpen, syncMode, syncPairingQr])

  const importSyncPayload = useCallback(
    async (payload: string) => {
      try {
        if (!vaultRecord || !vaultKey) throw new Error("Unlock the receiver vault before syncing.")
        const trimmed = payload.trim()
        const currentVaultCryptoKey = await importVaultKey(vaultKey)
        const currentVaultData = normalizeVaultData(
          JSON.parse(await decryptWithKey(vaultRecord.payload, currentVaultCryptoKey)) as VaultData,
        )

        const importVault = async (incomingVault: VaultRecord, frameMessage: string) => {
          const incomingVaultData = normalizeVaultData(
            JSON.parse(await decryptWithKey(incomingVault.payload, currentVaultCryptoKey)) as VaultData,
          )
          const mergedVaultData = mergeVaultData(currentVaultData, incomingVaultData)
          const nextVaultRecord: VaultRecord = {
            ...vaultRecord,
            payload: await encryptWithKey(JSON.stringify(mergedVaultData satisfies VaultData), currentVaultCryptoKey),
            updatedAt: new Date().toISOString(),
          }
          await writeStoredValue(VAULT_STORAGE_KEY, JSON.stringify(nextVaultRecord))
          setVaultRecord(nextVaultRecord)
          setVaultData(mergedVaultData)
          setCredentials(mergedVaultData.credentials)
          setActiveLicense(mergedVaultData.metadata?.license || null)
          setSyncDone({
            deviceName: incomingVaultData.metadata?.syncedDevices[0]?.label || "Synced device",
            deviceId: incomingVaultData.metadata?.deviceId || "unknown",
          })
          setSyncOtpInput("")
          setSyncMessage(frameMessage)
        }

        const assertOtp = (payloadToVerify: string) => {
          const enteredOtp = syncOtpInput.trim().replace(/\s+/g, "").toUpperCase()
          if (expectedSyncPairing && checksumText(payloadToVerify) !== expectedSyncPairing.checksum) {
            throw new Error("Pairing mismatch. Scan the current client QR before receiving the payload.")
          }

          if (!enteredOtp && !expectedSyncPairing) return

          const actualOtp = checksumText(payloadToVerify).slice(0, 8).toUpperCase()
          const expectedOtp = expectedSyncPairing?.otp || enteredOtp
          if (expectedOtp !== actualOtp) throw new Error("OTP mismatch. Generate a fresh pairing QR and try again.")
        }

        if (trimmed.startsWith(SYNC_PAIRING_PREFIX)) {
          const pairing = decodeSyncPairingPayload(trimmed)
          setExpectedSyncPairing({
            sessionId: pairing.sessionId,
            otp: pairing.otp,
            checksum: pairing.checksum,
            createdAt: pairing.createdAt,
            ...(pairing.deviceId ? { deviceId: pairing.deviceId } : {}),
          })
          setSyncOtpInput(pairing.otp)
          setSyncMessage(
            `Paired with client ${pairing.deviceId || pairing.sessionId}. Waiting for encrypted Bluetooth/local payload.`,
          )
          return
        }

        if (trimmed.startsWith(SYNC_QR_PREFIX)) {
          assertOtp(trimmed)
          const vault = decodeSyncPayload(trimmed)
          setExpectedSyncPairing(null)
          await importVault(vault, "Sync complete. Pairing verified and data was merged without erasing this device.")
          return
        }

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
            return
          }

          const ordered = frames.slice(0, parsed.total)
          const assembled = ordered.map((frame) => frame?.chunk || "").join("")
          if (checksumText(assembled) !== parsed.checksum) throw new Error("Checksum mismatch")
          assertOtp(assembled)

          const vault = decodeSyncPayload(assembled)
          setExpectedSyncPairing(null)
          await importVault(vault, "All frames imported. Pairing verified and data was merged without erasing this device.")
          return
        }

        assertOtp(trimmed)
        const vault = decodeSyncPayload(trimmed)
        setExpectedSyncPairing(null)
        await importVault(vault, "Sync complete. Pairing verified and data was merged without erasing this device.")
      } catch (error) {
        setSyncMessage(error instanceof Error ? error.message : "Invalid, incomplete, or unreadable sync QR frame.")
      }
    },
    [expectedSyncPairing, syncOtpInput, vaultKey, vaultRecord],
  )

  const scanSyncQr = useCallback(async () => {
    setSyncMessage("")
    setSyncDone(null)

    try {
      const video = scanVideoRef.current
      if (!video) return
      setSyncMessage("Point the camera at the CredStore QR code.")
      const rawValue = await scanQrFromVideo(video)
      await importSyncPayload(rawValue)
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Camera QR scanning failed.")
    }
  }, [importSyncPayload])

  const loadBluetoothReceivers = useCallback(async () => {
    try {
      if (!syncCode) throw new Error("Generate a pairing QR/OTP first.")

      if (!Capacitor.isNativePlatform() && window.credstoreNative?.localSync) {
        setBluetoothMessage("Looking for desktop receivers on the local network...")
        const availability = await window.credstoreNative.localSync.isAvailable()
        if (!availability.available) throw new Error(availability.message || "Desktop local sync is not available.")
        const result = await window.credstoreNative.localSync.discoverReceivers({ otp: syncCode })
        setBluetoothDevices(result.devices || [])
        setBluetoothMessage(
          result.devices?.length
            ? "Pick the desktop receiver that is waiting with this OTP."
            : "No desktop receivers found. Start the receiver with this OTP and try again.",
        )
        return
      }

      if (!Capacitor.isNativePlatform()) {
        throw new Error("Desktop local sync is available only in the Electron app, not in a regular browser.")
      }

      setBluetoothMessage("Looking for local CredStore receivers...")
      const permissions = await CredStoreBluetooth.requestBluetoothPermissions()
      if (!permissions.granted) throw new Error("Bluetooth permission was not granted.")

      const availability = await CredStoreBluetooth.isAvailable()
      if (!availability.available) throw new Error(availability.message || "Bluetooth is not available.")

      const result = await CredStoreBluetooth.listBondedDevices()
      setBluetoothDevices(result.devices || [])
      setBluetoothMessage(
        result.devices?.length
          ? "Pick the receiver that has scanned this pairing QR."
          : "No CredStore receivers found. Start receiver mode on the other device and try again.",
      )
    } catch (error) {
      setBluetoothDevices([])
      setBluetoothMessage(error instanceof Error ? error.message : "Bluetooth receiver discovery failed.")
    }
  }, [])

  const sendBluetoothSyncPayload = useCallback(
    async (device: CredStoreBluetoothDevice) => {
      try {
        if (!syncPayload || !syncPairingQr) throw new Error("Generate a pairing QR first.")

        if (!Capacitor.isNativePlatform() && window.credstoreNative?.localSync) {
          if (!device.host || !device.port) throw new Error("Desktop receiver address is missing.")
          setBluetoothMessage(`Sending encrypted payload to ${device.name || device.id} over local Wi-Fi...`)
          await window.credstoreNative.localSync.sendPayload({
            host: device.host,
            port: device.port,
            otp: syncCode,
            checksum: checksumText(syncPayload),
            payload: syncPayload,
          })
          setBluetoothMessage(`Encrypted payload sent to ${device.name || device.id}.`)
          return
        }

        setBluetoothMessage(`Sending encrypted payload to ${device.name || device.id} over Bluetooth...`)
        await CredStoreBluetooth.sendPayload({ deviceId: device.id, payload: syncPayload })
        setBluetoothMessage(`Encrypted payload sent to ${device.name || device.id}.`)
      } catch (error) {
        setBluetoothMessage(error instanceof Error ? error.message : "Local payload send failed.")
      }
    },
    [syncCode, syncPairingQr, syncPayload],
  )

  const startBluetoothSyncReceiver = useCallback(async () => {
    try {
      if (!expectedSyncPairing && !syncOtpInput.trim()) {
        throw new Error("Scan the client's short pairing QR or enter the OTP before starting the payload receiver.")
      }
      const otp = expectedSyncPairing?.otp || syncOtpInput.trim().replace(/\s+/g, "").toUpperCase()
      const checksum = expectedSyncPairing?.checksum

      if (!Capacitor.isNativePlatform() && window.credstoreNative?.localSync) {
        setIsBluetoothReceiving(true)
        setBluetoothMessage("Waiting for encrypted local Wi-Fi payload...")
        const availability = await window.credstoreNative.localSync.isAvailable()
        if (!availability.available) throw new Error(availability.message || "Desktop local sync is not available.")
        const result = await window.credstoreNative.localSync.startReceiver({ otp, ...(checksum ? { checksum } : {}) })
        await importSyncPayload(result.payload)
        setBluetoothMessage(`Encrypted payload received from ${result.deviceName || result.deviceId || "desktop client"}.`)
        return
      }

      if (!Capacitor.isNativePlatform()) {
        throw new Error("Desktop local sync is available only in the Electron app, not in a regular browser.")
      }

      setIsBluetoothReceiving(true)
      setBluetoothMessage("Waiting for encrypted Bluetooth payload...")
      const permissions = await CredStoreBluetooth.requestBluetoothPermissions()
      if (!permissions.granted) throw new Error("Bluetooth permission was not granted.")

      const availability = await CredStoreBluetooth.isAvailable()
      if (!availability.available) throw new Error(availability.message || "Bluetooth is not available.")

      const result = await CredStoreBluetooth.startReceiver()
      await importSyncPayload(result.payload)
      setBluetoothMessage("Encrypted payload received.")
    } catch (error) {
      setBluetoothMessage(error instanceof Error ? error.message : "Local payload receive failed.")
    } finally {
      setIsBluetoothReceiving(false)
    }
  }, [expectedSyncPairing, importSyncPayload, syncOtpInput])

  const stopBluetoothSyncReceiver = useCallback(async () => {
    try {
      if (!Capacitor.isNativePlatform() && window.credstoreNative?.localSync) {
        await window.credstoreNative.localSync.stopReceiver()
      } else {
        await CredStoreBluetooth.stopReceiver()
      }
      setBluetoothMessage("Local payload receiver stopped.")
    } catch (error) {
      setBluetoothMessage(error instanceof Error ? error.message : "Unable to stop Bluetooth receiver.")
    } finally {
      setIsBluetoothReceiving(false)
    }
  }, [])

  const verifyLicenseToken = useCallback(async (token: string): Promise<LicenseRecord> => {
    await assertMonotonicLicenseClock()

    const [payloadPart, signaturePart] = token.trim().split(".")
    if (!payloadPart || !signaturePart) throw new Error("License must be payload.signature")

    const payloadBytes = new TextEncoder().encode(payloadPart)
    const signature = base64UrlToBytes(signaturePart)
    const verified = await verifyEd25519(signature, payloadBytes, getLicensePublicKeyBytes())
    if (!verified) throw new Error("License signature is invalid")

    const payload = decodePayload<Omit<LicenseRecord, "token">>(payloadPart)
    if (payload.alg !== "Ed25519") throw new Error("License algorithm is unsupported")
    if (payload.expiresAt && Date.parse(payload.expiresAt) < Date.now()) {
      throw new Error("License is expired")
    }
    if (
      payload.accountIdentity &&
      vaultData.metadata?.accountIdentity &&
      payload.accountIdentity !== vaultData.metadata.accountIdentity
    ) {
      throw new Error("License belongs to a different CredStore account identity")
    }

    return {
      ...payload,
      token,
    }
  }, [vaultData.metadata?.accountIdentity])

  const scanLicenseQr = useCallback(async () => {
    setLicenseMessage("")

    try {
      const video = licenseScanVideoRef.current
      if (!video) return
      setLicenseMessage("Point the camera at the license QR code.")
      const rawValue = await scanQrFromVideo(video)
      setLicenseToken(rawValue.trim())
      setLicenseMessage("License QR scanned. Press Validate Offline License.")
    } catch (error) {
      setLicenseMessage(error instanceof Error ? error.message : "Camera license QR scanning failed.")
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

  const updateAdminAuth = useCallback(
    async (adminAuth: NonNullable<VaultData["adminAuth"]>) => {
      if (!vaultRecord || !vaultKey) return
      await persistVault(credentials, vaultRecord, vaultKey, normalizeVaultData({ ...vaultData, adminAuth }))
    },
    [credentials, persistVault, vaultData, vaultKey, vaultRecord],
  )

  const setEnterpriseAdminPassword = useCallback(async () => {
    if (!adminPasswordMeetsPolicy(adminPassword)) {
      setAdminAuthMessage("Admin password needs 8+ chars with uppercase, lowercase, number, and symbol.")
      return
    }

    const result = await hashAdminPassword(adminPassword)
    await updateAdminAuth({
      ...(vaultData.adminAuth || {}),
      passwordHash: result.hash,
      passwordSalt: result.salt,
      failedAttempts: 0,
      lockoutUntil: 0,
      updatedAt: new Date().toISOString(),
    })
    setAdminAuthenticated(true)
    setAdminPassword("")
    setAdminAuthMessage("Admin password saved and authenticated.")
  }, [adminPassword, updateAdminAuth, vaultData.adminAuth])

  const authenticateEnterpriseAdmin = useCallback(async () => {
    const auth = vaultData.adminAuth
    if (!auth?.passwordHash || !auth.passwordSalt) {
      await setEnterpriseAdminPassword()
      return
    }

    if (Date.now() < (auth.lockoutUntil || 0)) {
      setAdminAuthMessage("Admin authentication is temporarily locked. Wait and try again.")
      return
    }

    const result = await hashAdminPassword(adminPassword, auth.passwordSalt)
    if (result.hash === auth.passwordHash) {
      await updateAdminAuth({ ...auth, failedAttempts: 0, lockoutUntil: 0, updatedAt: new Date().toISOString() })
      setAdminAuthenticated(true)
      setAdminPassword("")
      setAdminAuthMessage("Admin authenticated.")
      return
    }

    const failedAttempts = (auth.failedAttempts || 0) + 1
    const lockoutUntil = failedAttempts >= MAX_ADMIN_AUTH_FAILURES ? Date.now() + ADMIN_AUTH_LOCKOUT_MS : 0
    await updateAdminAuth({ ...auth, failedAttempts, lockoutUntil, updatedAt: new Date().toISOString() })
    setAdminAuthenticated(false)
    setAdminAuthMessage(
      lockoutUntil
        ? "Too many failed admin attempts. Locked for 30 seconds."
        : `Invalid admin password. ${MAX_ADMIN_AUTH_FAILURES - failedAttempts} attempts left.`,
    )
  }, [adminPassword, setEnterpriseAdminPassword, updateAdminAuth, vaultData.adminAuth])

  const startAdminAuthenticatorSetup = useCallback(() => {
    setAdminAuthenticatorSecret(createTotpSecret())
    setAdminAuthenticatorCode("")
    setAdminAuthMessage("Scan the QR in an authenticator app, then enter the 6-digit code to enable offline admin login.")
  }, [])

  const confirmAdminAuthenticatorSetup = useCallback(async () => {
    if (!adminAuthenticatorSecret) {
      setAdminAuthMessage("Generate an authenticator QR first.")
      return
    }

    if (!(await verifyTotp(adminAuthenticatorSecret, adminAuthenticatorCode))) {
      setAdminAuthMessage("Authenticator code is invalid. Check the device clock and try again.")
      return
    }

    await updateAdminAuth({
      ...(vaultData.adminAuth || { updatedAt: new Date().toISOString() }),
      otpSecret: adminAuthenticatorSecret,
      failedAttempts: 0,
      lockoutUntil: 0,
      updatedAt: new Date().toISOString(),
    })
    setAdminAuthenticated(true)
    setAdminAuthenticatorSecret("")
    setAdminAuthenticatorCode("")
    setAdminAuthMessage("Offline authenticator enabled and admin authenticated.")
  }, [adminAuthenticatorCode, adminAuthenticatorSecret, updateAdminAuth, vaultData.adminAuth])

  const authenticateAdminAuthenticator = useCallback(async () => {
    const auth = vaultData.adminAuth
    if (!auth?.otpSecret) {
      setAdminAuthMessage("No offline authenticator is registered.")
      return
    }

    if (Date.now() < (auth.lockoutUntil || 0)) {
      setAdminAuthMessage("Admin authentication is temporarily locked. Wait and try again.")
      return
    }

    if (await verifyTotp(auth.otpSecret, adminAuthenticatorCode)) {
      await updateAdminAuth({ ...auth, failedAttempts: 0, lockoutUntil: 0, updatedAt: new Date().toISOString() })
      setAdminAuthenticated(true)
      setAdminAuthenticatorCode("")
      setAdminAuthMessage("Offline authenticator accepted.")
      return
    }

    const failedAttempts = (auth.failedAttempts || 0) + 1
    const lockoutUntil = failedAttempts >= MAX_ADMIN_AUTH_FAILURES ? Date.now() + ADMIN_AUTH_LOCKOUT_MS : 0
    await updateAdminAuth({ ...auth, failedAttempts, lockoutUntil, updatedAt: new Date().toISOString() })
    setAdminAuthenticated(false)
    setAdminAuthMessage(
      lockoutUntil
        ? "Too many failed admin attempts. Locked for 30 seconds."
        : `Invalid authenticator code. ${MAX_ADMIN_AUTH_FAILURES - failedAttempts} attempts left.`,
    )
  }, [adminAuthenticatorCode, updateAdminAuth, vaultData.adminAuth])

  const addProfile = useCallback(async () => {
    if (!vaultRecord || !vaultKey || !newProfileName.trim() || !adminAuthenticated) return

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
          groupIds: selectedGroupId ? [selectedGroupId] : [],
          createdAt: new Date().toISOString(),
        },
      ],
    })

    await persistVault(credentials, vaultRecord, vaultKey, nextVaultData)
    setNewProfileName("")
  }, [adminAuthenticated, credentials, newProfileName, persistVault, selectedGroupId, vaultData, vaultKey, vaultRecord])

  const addEnterpriseGroup = useCallback(async () => {
    if (!vaultRecord || !vaultKey || !adminAuthenticated || !newGroupName.trim()) return

    const group: EnterpriseGroup = {
      id: createId(),
      name: sanitizeText(newGroupName, 80).trim(),
      profileIds: [],
      createdAt: new Date().toISOString(),
    }
    await persistVault(credentials, vaultRecord, vaultKey, normalizeVaultData({ ...vaultData, groups: [...(vaultData.groups || []), group] }))
    setNewGroupName("")
    setSelectedGroupId(group.id)
  }, [adminAuthenticated, credentials, newGroupName, persistVault, vaultData, vaultKey, vaultRecord])

  const setProfileGroupMembership = useCallback(
    async (profileId: string, groupId: string, enabled: boolean) => {
      if (!vaultRecord || !vaultKey || !adminAuthenticated) return

      const currentData = normalizeVaultData(vaultData)
      const groups = (currentData.groups || []).map((group) =>
        group.id === groupId
          ? {
              ...group,
              profileIds: enabled
                ? Array.from(new Set([...group.profileIds, profileId]))
                : group.profileIds.filter((id) => id !== profileId),
            }
          : group,
      )
      const profiles = (currentData.profiles || []).map((profile) =>
        profile.id === profileId
          ? {
              ...profile,
              groupIds: enabled
                ? Array.from(new Set([...(profile.groupIds || []), groupId]))
                : (profile.groupIds || []).filter((id) => id !== groupId),
            }
          : profile,
      )
      await persistVault(credentials, vaultRecord, vaultKey, normalizeVaultData({ ...currentData, groups, profiles }))
    },
    [adminAuthenticated, credentials, persistVault, vaultData, vaultKey, vaultRecord],
  )

  const updateCredentialAccess = useCallback(
    async (
      credentialId: string,
      patch: Pick<Partial<Credential>, "ownerProfileId" | "visibleToProfileIds" | "visibleToGroupIds">,
    ) => {
      if (!vaultRecord || !vaultKey || !adminAuthenticated) return

      const nextCredentials = credentials.map((credential) =>
        credential.id === credentialId ? { ...credential, ...patch, updatedAt: new Date().toISOString() } : credential,
      )
      setCredentials(nextCredentials)
      await persistVault(nextCredentials)
    },
    [adminAuthenticated, credentials, persistVault, vaultKey, vaultRecord],
  )

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
      const visibleByEnterpriseRule =
        adminAuthenticated ||
        !activeProfile ||
        !credential.ownerProfileId ||
        credential.ownerProfileId === activeProfile.id ||
        (credential.visibleToProfileIds || []).includes(activeProfile.id) ||
        activeProfileGroups.some((group) => (credential.visibleToGroupIds || []).includes(group.id))
      const search = searchTerm.trim().toLowerCase()
      const matchesCategory = selectedCategory === "all" || credential.category === selectedCategory
      const matchesSearch =
        !search ||
        credential.title.toLowerCase().includes(search) ||
        credential.fields.some(
          (field) => field.key.toLowerCase().includes(search) || (!field.secret && field.value.toLowerCase().includes(search)),
        )

      return visibleByEnterpriseRule && matchesCategory && matchesSearch
    })
  }, [activeProfile, activeProfileGroups, adminAuthenticated, credentials, searchTerm, selectedCategory])

  const selectAllFiltered = useCallback(() => {
    setSelectionMode(true)
    setSelectedCredentialIds(new Set(filteredCredentials.map((credential) => credential.id)))
  }, [filteredCredentials])

  const biometricButtonIcon = (target: BiometricUiState["target"], fallback: ReactNode) => {
    if (biometricUi.target !== target) return fallback
    if (biometricUi.phase === "running") return <Loader2 className="mr-2 h-4 w-4 animate-spin" />
    if (biometricUi.phase === "success") return <CheckCircle2 className="mr-2 h-4 w-4 animate-pulse text-emerald-300" />
    return fallback
  }

  if (isLocked) {
    return (
      <main
        className={`flex h-dvh overflow-hidden bg-gradient-to-br ${themeClass} items-center justify-center p-4 md:pt-12`}
        style={{ paddingTop: "max(2.75rem, env(safe-area-inset-top))", paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <DesktopWindowChrome />
        <BiometricCeremony state={biometricUi} />
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
              <div className="space-y-1">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-white/20 bg-white/5 text-xs text-white hover:bg-white/10"
                  onClick={() => handleBiometricUnlock("fingerprint")}
                  disabled={biometricUi.phase === "running" || !canUseFingerprint}
                >
                  {biometricButtonIcon("login-fingerprint", <Fingerprint className="mr-2 h-4 w-4" />)}
                  {nativeBiometricLabel === "Touch ID" ? "Touch ID" : "Fingerprint"}
                </Button>
                <p className={`text-center text-[11px] ${savedFingerprintSlot ? "text-emerald-300" : "text-gray-400"}`}>
                  {savedFingerprintSlot ? "Registered" : "Not registered"}
                </p>
              </div>
              <div className="space-y-1">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-white/20 bg-white/5 text-xs text-white hover:bg-white/10"
                  onClick={() => handleBiometricUnlock("face")}
                  disabled={biometricUi.phase === "running" || !canUseFace}
                >
                  {biometricButtonIcon("login-face", <ScanFace className="mr-2 h-4 w-4" />)}
                  Face
                </Button>
                <p className={`text-center text-[11px] ${savedFaceSlot ? "text-emerald-300" : "text-gray-400"}`}>
                  {savedFaceSlot ? "Registered" : "Not registered"}
                </p>
              </div>
            </div>
            <p className="text-center text-xs text-gray-400">{describeBiometricAvailability(biometricAvailability)}</p>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main
      className={`h-dvh overflow-hidden bg-gradient-to-br ${themeClass} md:pt-8`}
      style={{ paddingTop: "max(2.5rem, env(safe-area-inset-top))", paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <DesktopWindowChrome />
      <BiometricCeremony state={biometricUi} />
      <div className="mx-auto flex h-full max-w-4xl flex-col gap-4 overflow-hidden px-3 pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex items-center gap-2">
            <LogoMark className="h-8 w-8" />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-white">CredStore</h1>
              <p className="text-xs text-gray-300">
                {credentials.length} credentials - v{APP_VERSION}
              </p>
            </div>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:shrink-0 sm:items-center sm:gap-1">
            <Select value={activeProfile?.id || ""} onValueChange={setActiveProfileId}>
              <SelectTrigger className="h-9 w-full border-white/20 bg-white/5 text-xs text-white sm:h-8 sm:w-36">
                <SelectValue placeholder="Profile" />
              </SelectTrigger>
              <SelectContent className="border-gray-700 bg-gray-900/95 text-white">
                {vaultData.profiles?.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Dialog open={isSyncOpen} onOpenChange={setIsSyncOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 w-full border-white/20 bg-white/5 px-2 py-1 text-xs text-white hover:bg-white/10 sm:h-8 sm:w-auto">
                  <Wifi className="mr-1 h-3 w-3" />
                  Sync
                </Button>
              </DialogTrigger>
              <DialogContent
                className={
                  "grid max-h-[calc(100dvh-4.75rem)] w-[calc(100vw-1rem)] max-w-[26rem] " +
                  "grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden border-gray-700 bg-gray-900/95 p-0 text-white"
                }
              >
                <DialogHeader className="border-b border-white/10 px-4 pb-3 pt-4">
                  <DialogTitle className="text-sm">Local Device Sync</DialogTitle>
                  <DialogDescription className="text-xs text-gray-400">
                    Pair devices with a short QR/OTP, then transfer the encrypted vault over a local device channel.
                  </DialogDescription>
                </DialogHeader>
                <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain px-4 pb-16 pt-3 sm:pb-4">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={syncMode === "client" ? "default" : "outline"}
                      onClick={() => {
                        setSyncMode("client")
                        setSyncMessage("")
                        setBluetoothMessage("")
                        if (!syncPairingQr) createSyncCode()
                      }}
                      className={`text-xs transition-all active:scale-95 ${
                        syncMode === "client"
                          ? "bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-lg ring-2 ring-white/50"
                          : "border-white/20 bg-white/5 text-white hover:bg-white/10"
                      }`}
                    >
                      Client
                    </Button>
                    <Button
                      type="button"
                      variant={syncMode === "receiver" ? "default" : "outline"}
                      onClick={() => {
                        setSyncMode("receiver")
                        setSyncOtpInput("")
                        setExpectedSyncPairing(null)
                        setBluetoothMessage("")
                        setSyncMessage("Receiver ready. Scan the pairing QR or enter the OTP.")
                      }}
                      className={`text-xs transition-all active:scale-95 ${
                        syncMode === "receiver"
                          ? "bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-lg ring-2 ring-white/50"
                          : "border-white/20 bg-white/5 text-white hover:bg-white/10"
                      }`}
                    >
                      Receiver
                    </Button>
                  </div>
                  {syncMode === "client" ? (
                    <div className="space-y-3">
                        <div className="rounded-lg border border-white/15 bg-gradient-to-br from-white to-slate-100 p-3 text-center text-slate-950 shadow-xl shadow-black/30">
                          <div className="mb-2 flex items-center justify-center gap-2 text-xs font-semibold text-slate-700">
                            <LogoMark className="h-5 w-5" />
                            CredStore One-Time Sync
                          </div>
                          {syncPairingQr ? (
                          <QrRenderBoundary
                            key={syncPairingQr}
                            onError={() => setSyncMessage("Pairing QR generation failed. Generate a new pairing QR.")}
                          >
                            <div
                              className={
                                "mx-auto grid aspect-square w-full max-w-[244px] place-items-center rounded-lg " +
                                "border border-slate-200 bg-white p-2 shadow-inner sm:max-w-[300px]"
                              }
                            >
                              <QRCodeCanvas
                                value={syncPairingQr}
                                size={224}
                                level="M"
                                includeMargin
                                imageSettings={{
                                  src: RUNTIME_LOGO_PATH,
                                  height: 28,
                                  width: 28,
                                  excavate: true,
                                }}
                              />
                            </div>
                          </QrRenderBoundary>
                        ) : (
                          <div
                            className={
                              "mx-auto grid aspect-square w-full max-w-[244px] place-items-center rounded-lg " +
                              "border border-slate-200 bg-white p-2 shadow-inner sm:max-w-[300px]"
                            }
                          >
                            <QrCode className="h-24 w-24 text-gray-500" />
                          </div>
                        )}
                        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {syncCode || "One-time"}
                        </p>
                      </div>
                      <Button
                        onClick={createSyncCode}
                        className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-sm"
                      >
                        Generate Pairing QR / OTP
                      </Button>
                      <div className="space-y-2 rounded-md border border-white/10 bg-white/5 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-gray-200">Local encrypted transfer</p>
                          <Badge className="bg-white/10 text-gray-300">LAN / Bluetooth</Badge>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={loadBluetoothReceivers}
                          disabled={!syncPayload}
                          className="w-full border-white/20 bg-white/5 text-sm text-white hover:bg-white/10"
                        >
                          Find Nearby Receivers
                        </Button>
                        {bluetoothDevices.map((device) => (
                          <Button
                            key={device.id}
                            type="button"
                            variant="outline"
                            onClick={() => sendBluetoothSyncPayload(device)}
                            className="w-full justify-start border-white/20 bg-white/5 text-sm text-white hover:bg-white/10"
                          >
                            Send encrypted payload to {device.name || device.id}
                          </Button>
                        ))}
                        <p className="text-xs text-gray-400">
                          QR/OTP only pairs the devices. Desktop uses local Wi-Fi/LAN; mobile uses the native local
                          Bluetooth bridge. The vault payload remains encrypted.
                        </p>
                      </div>
                      <div className="rounded-md border border-white/10 bg-white/5 p-3">
                        <p className="text-xs text-gray-300">
                          Open receiver mode on the other device, scan this pairing QR or type the OTP, then send the
                          encrypted payload over LAN/Bluetooth local transport. CredStore merges data without erasing receiver
                          data.
                        </p>
                      </div>
                      <p className="text-xs text-gray-300">
                        {syncLimitLabel}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                        <div className="rounded-lg border border-white/15 bg-gradient-to-br from-white to-slate-100 p-3 text-center text-slate-950 shadow-xl shadow-black/30">
                          <div className="mb-2 flex items-center justify-center gap-2 text-xs font-semibold text-slate-700">
                            <LogoMark className="h-5 w-5" />
                            CredStore Receiver
                          </div>
                          <video
                            ref={scanVideoRef}
                            className={
                              "mx-auto aspect-[4/3] w-full max-w-[244px] rounded-lg border border-slate-200 " +
                              "bg-black object-cover shadow-inner sm:aspect-square sm:max-w-[300px]"
                            }
                            muted
                          playsInline
                        />
                        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Scan Pairing QR
                      </p>
                      </div>
                      <Button onClick={scanSyncQr} className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-sm">
                        Open Camera and Scan
                      </Button>
                      <div className="space-y-2 rounded-md border border-white/10 bg-white/5 p-3">
                        <Label className="text-xs">Pairing OTP</Label>
                        <Input
                          value={syncOtpInput}
                          onChange={(event) => setSyncOtpInput(event.target.value.toUpperCase())}
                          className="h-10 border-white/20 bg-black/20 font-mono text-sm uppercase tracking-[0.25em] text-white"
                          maxLength={8}
                          placeholder="77C74FA2"
                        />
                        <p className="text-xs text-gray-400">
                          Scan the pairing QR to fill this automatically, or type the 8-character OTP from the client.
                        </p>
                      </div>
                      <div className="space-y-2 rounded-md border border-white/10 bg-white/5 p-3">
                        <Button
                          type="button"
                          onClick={startBluetoothSyncReceiver}
                          disabled={isBluetoothReceiving || (!expectedSyncPairing && !syncOtpInput.trim())}
                          className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-sm"
                        >
                          {isBluetoothReceiving ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Waiting for Payload
                            </>
                          ) : (
                            "Start Local Payload Receiver"
                          )}
                        </Button>
                        {isBluetoothReceiving && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={stopBluetoothSyncReceiver}
                            className="w-full border-white/20 bg-white/5 text-sm text-white hover:bg-white/10"
                          >
                            Stop Receiver
                          </Button>
                        )}
                        <p className="text-xs text-gray-400">
                          The receiver imports only a payload matching the scanned QR or typed OTP.
                        </p>
                      </div>
                      <p className="text-xs text-gray-300">
                        Pair first, then receive the encrypted local payload. No vault data is stored in the QR.
                      </p>
                    </div>
                  )}
                  {bluetoothMessage && <p className="text-xs text-blue-200">{bluetoothMessage}</p>}
                  {syncDone && (
                    <div className="flex items-center gap-3 rounded-md border border-emerald-400/30 bg-emerald-500/10 p-3 text-emerald-100">
                      <CheckCircle2 className="h-7 w-7 animate-pulse text-emerald-300" />
                      <div className="min-w-0 text-xs">
                        <p className="font-semibold">Sync complete</p>
                        <p className="truncate text-emerald-200">{syncDone.deviceName}</p>
                        <p className="truncate font-mono text-[11px] text-emerald-300">{syncDone.deviceId}</p>
                      </div>
                    </div>
                  )}
                  {syncMessage && <p className="text-xs text-gray-300">{syncMessage}</p>}
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 w-full border-white/20 bg-white/5 px-2 py-1 text-xs text-white hover:bg-white/10 sm:h-8 sm:w-auto">
                  <Settings className="mr-1 h-3 w-3" />
                  Settings
                </Button>
              </DialogTrigger>
              <DialogContent
                className={
                  "h-dvh w-screen max-w-none overflow-hidden rounded-none border-gray-700 bg-gray-900/95 p-0 text-white " +
                  "sm:h-auto sm:max-h-[calc(100dvh-4rem)] sm:w-[calc(100vw-1rem)] sm:max-w-5xl sm:rounded-lg"
                }
              >
                <DialogHeader>
                  <div className="border-b border-white/10 px-5 py-4">
                    <DialogTitle className="text-sm">Settings</DialogTitle>
                    <DialogDescription className="text-xs text-gray-400">
                      Theme, master keys, legal controls, reset, and enterprise features are available after login.
                    </DialogDescription>
                  </div>
                </DialogHeader>
                <div
                  className={
                    "grid h-[calc(100dvh-9.25rem)] min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-4 " +
                    "overflow-hidden p-4 sm:h-auto sm:max-h-[calc(100dvh-9rem)] sm:p-5"
                  }
                >
                  <div className="grid grid-cols-2 gap-2 rounded-md border border-white/10 bg-black/10 p-1">
                    <Button
                      type="button"
                      variant={settingsPanel === "settings" ? "default" : "ghost"}
                      onClick={() => setSettingsPanel("settings")}
                      className={`h-9 text-xs transition-all active:scale-95 ${
                        settingsPanel === "settings"
                          ? "bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-lg"
                          : "text-gray-200 hover:bg-white/10"
                      }`}
                    >
                      Settings
                    </Button>
                    <Button
                      type="button"
                      variant={settingsPanel === "enterprise" ? "default" : "ghost"}
                      onClick={() => setSettingsPanel("enterprise")}
                      className={`h-9 text-xs transition-all active:scale-95 ${
                        settingsPanel === "enterprise"
                          ? "bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-lg"
                          : "text-gray-200 hover:bg-white/10"
                      }`}
                    >
                      Enterprise
                    </Button>
                  </div>

                  <div
                    key={settingsPanel}
                    className="min-h-0 min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain pb-16 sm:pb-0"
                  >
                    {settingsPanel === "settings" ? (
                      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <section className="min-w-0 space-y-2 rounded-md border border-white/10 bg-white/5 p-3">
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

                        <section className="min-w-0 space-y-2 rounded-md border border-white/10 bg-white/5 p-3 lg:row-span-2">
                          <Label className="text-xs">Master Keys</Label>
                          <div className="space-y-2">
                            {vaultRecord?.keySlots.map((slot) => (
                              <div
                                key={slot.id}
                                className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs"
                              >
                                <div className="flex min-w-0 items-center gap-2">
                                  {slot.type === "password" && <Key className="h-3 w-3" />}
                                  {slot.type === "fingerprint" && <Fingerprint className="h-3 w-3" />}
                                  {slot.type === "face" && <ScanFace className="h-3 w-3" />}
                                  <span className="truncate">{slot.label}</span>
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
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
                              disabled={biometricUi.phase === "running" || !canUseFingerprint}
                            >
                              {biometricButtonIcon("register-fingerprint", <Fingerprint className="mr-1 h-3 w-3" />)}
                              Register {nativeBiometricLabel === "Touch ID" ? "Touch ID" : "Fingerprint"}
                            </Button>
                            <Button
                              onClick={() => addNativePlaceholder("face")}
                              variant="outline"
                              className="border-white/20 bg-white/5 text-xs text-white hover:bg-white/10"
                              disabled={biometricUi.phase === "running" || !canUseFace}
                            >
                              {biometricButtonIcon("register-face", <ScanFace className="mr-1 h-3 w-3" />)}
                              Register Face
                            </Button>
                          </div>
                          <div className="grid gap-2 rounded-md border border-white/10 bg-black/10 p-2 text-xs sm:grid-cols-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-gray-300">Fingerprint key</span>
                              <Badge className={savedFingerprintSlot ? "bg-emerald-500/20 text-emerald-200" : "bg-white/10 text-gray-300"}>
                                {savedFingerprintSlot ? "Registered" : "Not registered"}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-gray-300">Face key</span>
                              <Badge className={savedFaceSlot ? "bg-emerald-500/20 text-emerald-200" : "bg-white/10 text-gray-300"}>
                                {savedFaceSlot ? "Registered" : "Not registered"}
                              </Badge>
                            </div>
                          </div>
                          <p className="text-xs text-gray-400">{biometricRegistrationHint}</p>
                          {biometricMessage && <p className="text-xs text-amber-300">{biometricMessage}</p>}
                        </section>

                        <LegalDocsSection />

                        <UserManualSection />

                        <section className="space-y-2 rounded-md border border-red-400/30 bg-red-500/10 p-3 lg:col-span-2">
                          <Label className="text-xs">Danger Zone</Label>
                          <ResetCredStore />
                        </section>
                      </div>
                    ) : (
                      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <section className="min-w-0 space-y-2 rounded-md border border-white/10 bg-white/5 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-xs">Enterprise License</Label>
                            <Badge className="bg-white/10 text-gray-200">
                              {activeLicense ? activeLicense.plan : "Community"}
                            </Badge>
                          </div>
                          <p className="text-xs text-gray-400">
                            Community sync allows {FREE_SYNC_DEVICE_LIMIT} devices. A signed enterprise license unlocks higher offline limits.
                          </p>
                          <div className="rounded-md border border-white/10 bg-black/20 p-2">
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <span className="text-xs text-gray-400">Account Identity</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(vaultData.metadata?.accountIdentity || "")}
                                className="h-6 px-2 text-xs text-gray-200 hover:bg-white/10"
                              >
                                <Copy className="mr-1 h-3 w-3" />
                                Copy
                              </Button>
                            </div>
                            <p className="break-all font-mono text-[11px] text-gray-300">
                              {vaultData.metadata?.accountIdentity || "Unavailable"}
                            </p>
                          </div>
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
                            className="aspect-[4/3] w-full rounded-md border border-white/10 bg-black object-cover sm:aspect-video"
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

                        <section className="min-w-0 space-y-3 rounded-md border border-white/10 bg-white/5 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-xs">Admin Authentication</Label>
                            <Badge className={adminAuthenticated ? "bg-emerald-500/20 text-emerald-200" : "bg-white/10 text-gray-300"}>
                              {adminAuthenticated
                                ? "Authenticated"
                                : vaultData.adminAuth?.passwordHash || vaultData.adminAuth?.otpSecret
                                  ? "Locked"
                                  : "Setup"}
                            </Badge>
                          </div>
                          <p className="text-xs text-gray-400">
                            Authenticate before changing employees, project groups, or credential visibility. Use a local
                            admin password or an offline authenticator app. The authenticator QR never contacts a server.
                          </p>
                          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                            <Input
                              value={adminPassword}
                              onChange={(event) => setAdminPassword(event.target.value)}
                              className="border-white/20 bg-white/5 text-sm text-white"
                              placeholder={vaultData.adminAuth?.passwordHash ? "Admin password" : "Set admin password"}
                              type="password"
                            />
                            <Button
                              type="button"
                              onClick={authenticateEnterpriseAdmin}
                              disabled={isAdminAuthLocked || !adminPassword}
                              className="bg-gradient-to-r from-purple-500 to-blue-500 text-xs"
                            >
                              <ShieldCheck className="mr-1 h-3 w-3" />
                              {vaultData.adminAuth?.passwordHash ? "Authenticate" : "Set Password"}
                            </Button>
                          </div>
                          <div className="space-y-2 rounded-md border border-white/10 bg-black/10 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <Label className="text-xs">Offline Authenticator</Label>
                              <Badge className={vaultData.adminAuth?.otpSecret ? "bg-emerald-500/20 text-emerald-200" : "bg-white/10 text-gray-300"}>
                                {vaultData.adminAuth?.otpSecret ? "Registered" : "Not registered"}
                              </Badge>
                            </div>
                            {adminAuthenticatorUri && (
                              <div className="rounded-md bg-white p-3 text-center text-gray-900">
                                <div className="mb-2 flex items-center justify-center gap-2 text-xs font-semibold">
                                  <ShieldCheck className="h-4 w-4 text-purple-700" />
                                  CredStore Admin Authenticator
                                </div>
                                <QRCodeCanvas value={adminAuthenticatorUri} size={184} level="M" includeMargin />
                              </div>
                            )}
                            <Input
                              value={adminAuthenticatorCode}
                              onChange={(event) => setAdminAuthenticatorCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                              className="border-white/20 bg-white/5 text-center font-mono text-lg tracking-[0.35em] text-white"
                              inputMode="numeric"
                              placeholder="000000"
                            />
                            <div className="grid gap-2 sm:grid-cols-2">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={startAdminAuthenticatorSetup}
                                className="border-white/20 bg-white/5 text-xs text-white hover:bg-white/10"
                              >
                                <QrCode className="mr-1 h-3 w-3" />
                                Generate Setup QR
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={adminAuthenticatorSecret ? confirmAdminAuthenticatorSetup : authenticateAdminAuthenticator}
                                disabled={isAdminAuthLocked || adminAuthenticatorCode.length !== 6 || (!adminAuthenticatorSecret && !vaultData.adminAuth?.otpSecret)}
                                className="border-white/20 bg-white/5 text-xs text-white hover:bg-white/10"
                              >
                                <Key className="mr-1 h-3 w-3" />
                                {adminAuthenticatorSecret ? "Verify Setup Code" : "Authenticator Login"}
                              </Button>
                            </div>
                          </div>
                          {isAdminAuthLocked && (
                            <p className="text-xs text-amber-300">Locked for {Math.ceil(adminAuthLockoutRemaining / 1000)}s after failed attempts.</p>
                          )}
                          {adminAuthMessage && <p className="text-xs text-gray-300">{adminAuthMessage}</p>}
                        </section>

                        <section className="min-w-0 space-y-2 rounded-md border border-white/10 bg-white/5 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-xs">Employee Profiles & Projects</Label>
                            <Badge className="bg-white/10 text-gray-300">{vaultData.profiles?.length || 0} profiles</Badge>
                          </div>
                          <p className="text-xs text-gray-400">
                            Profiles and project groups are stored inside the encrypted vault. New credentials are owned by the active profile.
                          </p>
                          <div className="space-y-2">
                            {vaultData.profiles?.map((profile) => (
                              <div
                                key={profile.id}
                                className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <User className="h-3 w-3 text-gray-300" />
                                    <span className="truncate">{profile.name}</span>
                                  </div>
                                  <p className="mt-1 truncate text-[11px] text-gray-400">
                                    {(vaultData.groups || [])
                                      .filter((group) => group.profileIds.includes(profile.id))
                                      .map((group) => group.name)
                                      .join(", ") || "No project group"}
                                  </p>
                                </div>
                                <Badge className="bg-white/10 text-gray-300">
                                  {vaultData.roles?.find((role) => role.id === profile.roleId)?.name || "Role"}
                                </Badge>
                              </div>
                            ))}
                          </div>
                          <div className="grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
                            <Input
                              value={newProfileName}
                              onChange={(event) => setNewProfileName(event.target.value)}
                              className="border-white/20 bg-white/5 text-sm text-white"
                              placeholder="Employee profile name"
                            />
                            <Select value={selectedGroupId || "none"} onValueChange={(value) => setSelectedGroupId(value === "none" ? "" : value)}>
                              <SelectTrigger className="border-white/20 bg-white/5 text-sm text-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="border-gray-700 bg-gray-900/95 text-white">
                                <SelectItem value="none">No group</SelectItem>
                                {(vaultData.groups || []).map((group) => (
                                  <SelectItem key={group.id} value={group.id}>
                                    {group.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              onClick={addProfile}
                              disabled={!adminAuthenticated || !newProfileName.trim()}
                              className="bg-gradient-to-r from-purple-500 to-blue-500 text-xs"
                            >
                              Add
                            </Button>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                            <Input
                              value={newGroupName}
                              onChange={(event) => setNewGroupName(event.target.value)}
                              className="border-white/20 bg-white/5 text-sm text-white"
                              placeholder="Project group name"
                            />
                            <Button
                              type="button"
                              onClick={addEnterpriseGroup}
                              disabled={!adminAuthenticated || !newGroupName.trim()}
                              variant="outline"
                              className="border-white/20 bg-white/5 text-xs text-white hover:bg-white/10"
                            >
                              <Users className="mr-1 h-3 w-3" />
                              Create Group
                            </Button>
                          </div>
                          <div className="space-y-2">
                            {(vaultData.groups || []).map((group) => (
                              <div key={group.id} className="rounded-md border border-white/10 bg-black/10 p-2">
                                <div className="mb-2 flex items-center justify-between gap-2 text-xs text-gray-100">
                                  <span>{group.name}</span>
                                  <Badge className="bg-white/10 text-gray-300">{group.profileIds.length} employees</Badge>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {(vaultData.profiles || []).map((profile) => {
                                    const enabled = group.profileIds.includes(profile.id)
                                    return (
                                      <label key={profile.id} className="flex items-center gap-1 text-[11px] text-gray-300">
                                        <input
                                          checked={enabled}
                                          disabled={!adminAuthenticated}
                                          onChange={(event) => setProfileGroupMembership(profile.id, group.id, event.target.checked)}
                                          type="checkbox"
                                        />
                                        {profile.name}
                                      </label>
                                    )
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>

                        <section className="min-w-0 space-y-3 rounded-md border border-white/10 bg-white/5 p-3 lg:col-span-2">
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-xs">Hierarchical Visibility Control</Label>
                            <Badge className="bg-white/10 text-gray-300">{activeProfile?.name || "No profile"}</Badge>
                          </div>
                          <p className="text-xs text-gray-400">
                            Admin can assign each credential to an employee owner, then share visibility with specific employees or project groups.
                          </p>
                          {selectedVisibilityCredential ? (
                            <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                              <div className="space-y-2">
                                <Select value={selectedVisibilityCredential.id} onValueChange={setSelectedVisibilityCredentialId}>
                                  <SelectTrigger className="border-white/20 bg-white/5 text-sm text-white">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="border-gray-700 bg-gray-900/95 text-white">
                                    {credentials.map((credential) => (
                                      <SelectItem key={credential.id} value={credential.id}>
                                        {credential.title}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Select
                                  value={selectedVisibilityCredential.ownerProfileId || activeProfile?.id || ""}
                                  onValueChange={(ownerProfileId) => updateCredentialAccess(selectedVisibilityCredential.id, { ownerProfileId })}
                                  disabled={!adminAuthenticated}
                                >
                                  <SelectTrigger className="border-white/20 bg-white/5 text-sm text-white">
                                    <SelectValue placeholder="Owner profile" />
                                  </SelectTrigger>
                                  <SelectContent className="border-gray-700 bg-gray-900/95 text-white">
                                    {(vaultData.profiles || []).map((profile) => (
                                      <SelectItem key={profile.id} value={profile.id}>
                                        {profile.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <p className="text-xs text-gray-400">
                                  Owner: {(vaultData.profiles || []).find((profile) => profile.id === selectedVisibilityCredential.ownerProfileId)?.name || "Unassigned"}
                                </p>
                              </div>
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div className="space-y-2 rounded-md border border-white/10 bg-black/10 p-2">
                                  <div className="text-xs text-gray-100">Visible employees</div>
                                  {(vaultData.profiles || []).map((profile) => {
                                    const enabled = (selectedVisibilityCredential.visibleToProfileIds || []).includes(profile.id)
                                    return (
                                      <label key={profile.id} className="flex items-center gap-2 text-xs text-gray-300">
                                        <input
                                          checked={enabled}
                                          disabled={!adminAuthenticated}
                                          onChange={(event) => {
                                            const current = selectedVisibilityCredential.visibleToProfileIds || []
                                            updateCredentialAccess(selectedVisibilityCredential.id, {
                                              visibleToProfileIds: event.target.checked
                                                ? Array.from(new Set([...current, profile.id]))
                                                : current.filter((id) => id !== profile.id),
                                            })
                                          }}
                                          type="checkbox"
                                        />
                                        {profile.name}
                                      </label>
                                    )
                                  })}
                                </div>
                                <div className="space-y-2 rounded-md border border-white/10 bg-black/10 p-2">
                                  <div className="text-xs text-gray-100">Visible project groups</div>
                                  {(vaultData.groups || []).map((group) => {
                                    const enabled = (selectedVisibilityCredential.visibleToGroupIds || []).includes(group.id)
                                    return (
                                      <label key={group.id} className="flex items-center gap-2 text-xs text-gray-300">
                                        <input
                                          checked={enabled}
                                          disabled={!adminAuthenticated}
                                          onChange={(event) => {
                                            const current = selectedVisibilityCredential.visibleToGroupIds || []
                                            updateCredentialAccess(selectedVisibilityCredential.id, {
                                              visibleToGroupIds: event.target.checked
                                                ? Array.from(new Set([...current, group.id]))
                                                : current.filter((id) => id !== group.id),
                                            })
                                          }}
                                          type="checkbox"
                                        />
                                        {group.name}
                                      </label>
                                    )
                                  })}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400">Add a credential before assigning visibility.</p>
                          )}
                        </section>

                        <UserManualSection />
                      </div>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button
              onClick={lockVault}
              variant="outline"
              size="sm"
              className="h-9 w-full border-white/20 bg-white/5 px-2 py-1 text-xs text-white hover:bg-white/10 sm:h-8 sm:w-auto"
            >
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
              <Dialog open={isAddDialogOpen} onOpenChange={closeCredentialEditor}>
                <DialogTrigger asChild>
                  <Button
                    onClick={() => {
                      setEditingCredentialId(null)
                      setDraft({ ...createDraft(), ownerProfileId: activeProfile?.id || adminProfile?.id || "" })
                    }}
                    className="h-8 bg-gradient-to-r from-purple-500 to-blue-500 px-3 text-sm text-white hover:from-purple-600 hover:to-blue-600"
                  >
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
                    <DialogTitle className="text-sm">
                      {editingCredentialId ? "Edit Credential" : "Add Credential"}
                    </DialogTitle>
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
                            className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                          >
                            <Input
                              value={field.key}
                              onChange={(event) => updateDraftField(field.id, { key: event.target.value })}
                              className="h-8 border-white/20 bg-white/5 text-sm text-white"
                              placeholder="Key"
                            />
                            <div className="flex min-w-0 gap-1">
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
                            <div className="flex gap-1 sm:justify-end">
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
                    <div className="space-y-2 rounded-md border border-white/10 bg-black/10 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs">Enterprise Access</Label>
                        <Badge className="bg-white/10 text-gray-300">{activeProfile?.name || "Profile"}</Badge>
                      </div>
                      <Select
                        value={draft.ownerProfileId || activeProfile?.id || ""}
                        onValueChange={(ownerProfileId) => setDraft((previous) => ({ ...previous, ownerProfileId }))}
                      >
                        <SelectTrigger className="h-8 border-white/20 bg-white/5 text-sm text-white">
                          <SelectValue placeholder="Owner profile" />
                        </SelectTrigger>
                        <SelectContent className="border-gray-700 bg-gray-900/95 text-white">
                          {(vaultData.profiles || []).map((profile) => (
                            <SelectItem key={profile.id} value={profile.id}>
                              {profile.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="grid gap-2 text-xs sm:grid-cols-2">
                        <div className="space-y-1">
                          <div className="text-gray-300">Share with employees</div>
                          {(vaultData.profiles || []).map((profile) => {
                            const checked = (draft.visibleToProfileIds || []).includes(profile.id)
                            return (
                              <label key={profile.id} className="flex items-center gap-2 text-gray-300">
                                <input
                                  checked={checked}
                                  onChange={(event) => {
                                    const current = draft.visibleToProfileIds || []
                                    setDraft((previous) => ({
                                      ...previous,
                                      visibleToProfileIds: event.target.checked
                                        ? Array.from(new Set([...current, profile.id]))
                                        : current.filter((id) => id !== profile.id),
                                    }))
                                  }}
                                  type="checkbox"
                                />
                                {profile.name}
                              </label>
                            )
                          })}
                        </div>
                        <div className="space-y-1">
                          <div className="text-gray-300">Share with groups</div>
                          {(vaultData.groups || []).map((group) => {
                            const checked = (draft.visibleToGroupIds || []).includes(group.id)
                            return (
                              <label key={group.id} className="flex items-center gap-2 text-gray-300">
                                <input
                                  checked={checked}
                                  onChange={(event) => {
                                    const current = draft.visibleToGroupIds || []
                                    setDraft((previous) => ({
                                      ...previous,
                                      visibleToGroupIds: event.target.checked
                                        ? Array.from(new Set([...current, group.id]))
                                        : current.filter((id) => id !== group.id),
                                    }))
                                  }}
                                  type="checkbox"
                                />
                                {group.name}
                              </label>
                            )
                          })}
                        </div>
                      </div>
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
                      onClick={saveCredential}
                      className={
                        "sticky bottom-0 h-10 w-full bg-gradient-to-r from-purple-500 to-blue-500 " +
                        "text-sm shadow-[0_-12px_24px_rgba(17,24,39,0.95)]"
                      }
                      disabled={!draft.title || !draft.fields.some((field) => field.key && field.value)}
                    >
                      {editingCredentialId ? "Save Changes" : "Add Credential"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        {selectionMode && (
          <Card className="border-blue-300/30 bg-blue-500/10 shadow-sm">
            <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
              <p className="text-xs font-medium text-blue-100">{selectedCount} selected</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={selectAllFiltered}
                  className="h-8 border-white/20 bg-white/5 px-3 text-xs text-white hover:bg-white/10"
                >
                  Select All
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsSyncOpen(true)
                    setSyncMode("client")
                    setSyncPayload("")
                    createSyncCode().catch((error: Error) => setSyncMessage(error.message || "Sync QR generation failed."))
                  }}
                  disabled={selectedCount === 0}
                  className="h-8 border-white/20 bg-white/5 px-3 text-xs text-white hover:bg-white/10"
                >
                  Sync Selected
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={deleteSelectedCredentials}
                  disabled={selectedCount === 0}
                  className="h-8 border-red-300/30 bg-red-500/10 px-3 text-xs text-red-100 hover:bg-red-500/20"
                >
                  Delete Selected
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={clearSelection}
                  className="h-8 px-3 text-xs text-gray-200 hover:bg-white/10"
                >
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pb-3">
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
                ownerLabel={(vaultData.profiles || []).find((profile) => profile.id === credential.ownerProfileId)?.name}
                visibleFields={visibleFields}
                selected={selectedCredentialIds.has(credential.id)}
                selectionMode={selectionMode}
                onToggleField={toggleFieldVisibility}
                onCopy={copyToClipboard}
                onEdit={() => beginEditCredential(credential)}
                onDelete={() => deleteCredential(credential.id)}
                onToggleSelected={() => toggleCredentialSelected(credential.id)}
                onLongPress={() => enterSelectionMode(credential.id)}
              />
            ))
          )}
        </div>
      </div>
    </main>
  )
}
