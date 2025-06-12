// CredStore Data Storage Locations by Platform

interface StorageLocation {
  platform: string
  location: string
  masterKeyStored: boolean
  dataEncryption: string
  notes: string
}

const storageLocations: StorageLocation[] = [
  {
    platform: "Web Browser",
    location: "localStorage: browser's local storage",
    masterKeyStored: false,
    dataEncryption: "AES-256-GCM",
    notes: "Data cleared when browser cache is cleared",
  },
  {
    platform: "Linux Desktop",
    location: "~/.config/credstore/Local Storage/leveldb/",
    masterKeyStored: false,
    dataEncryption: "AES-256-GCM",
    notes: "Electron app data directory",
  },
  {
    platform: "Windows Desktop",
    location: "%APPDATA%/credstore/Local Storage/leveldb/",
    masterKeyStored: false,
    dataEncryption: "AES-256-GCM",
    notes: "Windows app data directory",
  },
  {
    platform: "macOS Desktop",
    location: "~/Library/Application Support/credstore/Local Storage/leveldb/",
    masterKeyStored: false,
    dataEncryption: "AES-256-GCM",
    notes: "macOS app data directory",
  },
  {
    platform: "Android",
    location: "/data/data/com.credstore.app/app_webview/Local Storage/leveldb/",
    masterKeyStored: false,
    dataEncryption: "AES-256-GCM",
    notes: "Android app private storage (requires root to access)",
  },
]

// Security Analysis
const securityFeatures = {
  masterKeyStorage: "Memory only - never persisted",
  dataEncryption: "AES-256-GCM with PBKDF2 key derivation",
  saltGeneration: "Cryptographically secure random salt per encryption",
  keyDerivation: "PBKDF2 with 100,000 iterations",
  autoLock: "Master key cleared when app locks/closes",
  offlineOnly: "No network communication - completely offline",
}

export { storageLocations, securityFeatures }
