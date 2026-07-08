export const VAULT_STORAGE_KEY = "credstore_vault_v2"
export const LEGACY_STORAGE_KEY = "credstore_data"
export const THEME_STORAGE_KEY = "credstore_theme"

const KDF_ITERATIONS = 600000
const VAULT_CONTEXT = "CredStore vault v2"

export type CredentialCategory = "website" | "api" | "database" | "other"
export type MasterKeyType = "password" | "fingerprint" | "face"
export type ThemeName = "indigo" | "emerald" | "slate" | "rose"

export interface CredentialField {
  id: string
  key: string
  value: string
  secret: boolean
}

export interface Credential {
  id: string
  title: string
  category: CredentialCategory
  fields: CredentialField[]
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface EncryptedPayload {
  encrypted: number[]
  iv: number[]
  salt?: string
}

export interface KeySlot {
  id: string
  type: MasterKeyType
  label: string
  wrappedKey?: EncryptedPayload
  enabled: boolean
}

export interface VaultRecord {
  version: 2
  payload: EncryptedPayload
  keySlots: KeySlot[]
  createdAt: string
  updatedAt: string
}

export interface VaultData {
  credentials: Credential[]
}

export interface CredentialDraft {
  title: string
  category: CredentialCategory
  fields: CredentialField[]
  notes: string
}

export interface LegacyCredential {
  id: string
  title: string
  username?: string
  password?: string
  url?: string
  notes?: string
  category?: CredentialCategory
  createdAt?: string
  updatedAt?: string
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const bytesToBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...Array.from(bytes)))

export const base64ToBytes = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0))

export const generateVaultKey = () => crypto.getRandomValues(new Uint8Array(32))

export const createDraft = (): CredentialDraft => ({
  title: "",
  category: "website",
  fields: [
    { id: createId(), key: "Username", value: "", secret: false },
    { id: createId(), key: "Password", value: "", secret: true },
  ],
  notes: "",
})

export const migrateLegacyCredential = (credential: LegacyCredential): Credential => {
  const fields: CredentialField[] = []

  if (credential.username) {
    fields.push({
      id: createId(),
      key: "Username",
      value: credential.username,
      secret: false,
    })
  }

  if (credential.password) {
    fields.push({
      id: createId(),
      key: "Password",
      value: credential.password,
      secret: true,
    })
  }

  if (credential.url) {
    fields.push({
      id: createId(),
      key: "URL",
      value: credential.url,
      secret: false,
    })
  }

  return {
    id: credential.id || createId(),
    title: credential.title || "Untitled",
    category: credential.category || "other",
    fields: fields.length
      ? fields
      : [
          {
            id: createId(),
            key: "Secret",
            value: "",
            secret: true,
          },
        ],
    notes: credential.notes || "",
    createdAt: credential.createdAt || new Date().toISOString(),
    updatedAt: credential.updatedAt || new Date().toISOString(),
  }
}

export const parseVault = (stored: string | null): VaultRecord | null => {
  if (!stored) return null

  const parsed = JSON.parse(stored)
  return parsed?.version === 2 ? parsed : null
}

export const readStoredValue = async (key: string) => {
  try {
    const { Preferences } = await import("@capacitor/preferences")
    const result = await Preferences.get({ key })

    if (result.value !== null) return result.value
  } catch {
    // Web and Electron fall back to localStorage.
  }

  return typeof window === "undefined" ? null : localStorage.getItem(key)
}

export const writeStoredValue = async (key: string, value: string) => {
  try {
    const { Preferences } = await import("@capacitor/preferences")
    await Preferences.set({ key, value })
  } catch {
    // Web and Electron fall back to localStorage.
  }

  localStorage.setItem(key, value)
}

export const removeStoredValue = async (key: string) => {
  try {
    const { Preferences } = await import("@capacitor/preferences")
    await Preferences.remove({ key })
  } catch {
    // Web and Electron fall back to localStorage.
  }

  localStorage.removeItem(key)
}

export const importVaultKey = (vaultKey: Uint8Array) =>
  crypto.subtle.importKey("raw", vaultKey, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])

export const encryptWithKey = async (data: string, key: CryptoKey): Promise<EncryptedPayload> => {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: textEncoder.encode(VAULT_CONTEXT),
    },
    key,
    textEncoder.encode(data),
  )

  return {
    encrypted: Array.from(new Uint8Array(encrypted)),
    iv: Array.from(iv),
  }
}

export const decryptWithKey = async (payload: EncryptedPayload, key: CryptoKey) => {
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(payload.iv),
      additionalData: textEncoder.encode(VAULT_CONTEXT),
    },
    key,
    new Uint8Array(payload.encrypted),
  )

  return textDecoder.decode(decrypted)
}

export const encryptWithPassword = async (data: string, password: string): Promise<EncryptedPayload> => {
  const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(24)))
  const key = await deriveKey(password, salt)

  return {
    ...(await encryptWithKey(data, key)),
    salt,
  }
}

export const decryptWithPassword = async (payload: EncryptedPayload, password: string) => {
  if (!payload.salt) throw new Error("Missing key salt")

  return decryptWithKey(payload, await deriveKey(password, payload.salt))
}

export const createPasswordSlotForKey = async (
  vaultKey: Uint8Array,
  password: string,
  label: string,
): Promise<KeySlot> => ({
  id: createId(),
  type: "password",
  label,
  enabled: true,
  wrappedKey: await encryptWithPassword(bytesToBase64(vaultKey), password),
})

async function deriveKey(password: string, salt: string) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  )

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: base64ToBytes(salt),
      iterations: KDF_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}
