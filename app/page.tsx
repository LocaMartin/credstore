"use client"

import type React from "react"
import { useState, useEffect, memo, useCallback, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
import {
  Lock,
  Plus,
  Search,
  Eye,
  EyeOff,
  Copy,
  Download,
  Trash2,
  Shield,
  Key,
  Database,
  Globe,
  Settings,
  LogOut,
} from "lucide-react"
import { ResetCredStore } from "@/components/reset-button"

interface Credential {
  id: string
  title: string
  username: string
  password: string
  url?: string
  notes?: string
  category: "website" | "api" | "database" | "other"
  createdAt: string
  updatedAt: string
}

// Lightweight credential card props
interface CredentialCardProps {
  credential: Credential
  showPassword: boolean
  onTogglePassword: () => void
  onCopyToClipboard: (text: string) => void
  onDelete: () => void
}

interface UnlockScreenProps {
  masterPassword: string
  setMasterPassword: (password: string) => void
  onUnlock: () => Promise<void>
  hasError: boolean
}

// Optimized encryption with reduced memory footprint
const generateSalt = (): string => {
  const array = new Uint8Array(8) // Reduced from 16 to 8 bytes
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

const deriveKey = async (password: string, salt: string): Promise<CryptoKey> => {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), { name: "PBKDF2" }, false, [
    "deriveKey",
  ])

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: 10000, // Reduced from 50000 for better performance
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )

  return key
}

const encryptData = async (data: string, password: string) => {
  const salt = generateSalt()
  const key = await deriveKey(password, salt)
  const encoder = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(data))

  return {
    encrypted: Array.from(new Uint8Array(encrypted)),
    iv: Array.from(iv),
    salt,
  }
}

const decryptData = async (encryptedData: any, password: string): Promise<string> => {
  try {
    const key = await deriveKey(password, encryptedData.salt)
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(encryptedData.iv) },
      key,
      new Uint8Array(encryptedData.encrypted),
    )

    return new TextDecoder().decode(decrypted)
  } catch (error) {
    throw new Error("Invalid password or corrupted data")
  }
}

// Highly optimized credential card with minimal re-renders
const CredentialCard = memo<CredentialCardProps>(
  ({ credential, showPassword, onTogglePassword, onCopyToClipboard, onDelete }) => {
    // Memoize icon to prevent recreation
    const categoryIcon = useMemo(() => {
      switch (credential.category) {
        case "website":
          return <Globe className="w-4 h-4" />
        case "api":
          return <Key className="w-4 h-4" />
        case "database":
          return <Database className="w-4 h-4" />
        default:
          return <Settings className="w-4 h-4" />
      }
    }, [credential.category])

    // Memoize copy handlers
    const handleCopyUsername = useCallback(() => {
      onCopyToClipboard(credential.username)
    }, [credential.username, onCopyToClipboard])

    const handleCopyPassword = useCallback(() => {
      onCopyToClipboard(credential.password)
    }, [credential.password, onCopyToClipboard])

    return (
      <Card className="bg-white/5 border-white/10 shadow-sm hover:bg-white/10 transition-colors duration-150">
        <CardContent className="p-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 space-y-1 min-w-0">
              <div className="flex items-center space-x-2">
                {categoryIcon}
                <h3 className="font-medium text-white truncate text-sm">{credential.title}</h3>
                <Badge variant="secondary" className="bg-white/20 text-white border-white/30 text-xs px-1 py-0">
                  {credential.category}
                </Badge>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex items-center space-x-2">
                  <span className="text-gray-400 w-16 flex-shrink-0">User:</span>
                  <span className="text-white truncate flex-1 font-mono">{credential.username}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCopyUsername}
                    className="h-5 w-5 p-0 text-gray-400 hover:text-white hover:bg-white/10 flex-shrink-0"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-gray-400 w-16 flex-shrink-0">Pass:</span>
                  <span className="text-white truncate flex-1 font-mono">
                    {showPassword ? credential.password : "••••••••"}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={onTogglePassword}
                    className="h-5 w-5 p-0 text-gray-400 hover:text-white hover:bg-white/10 flex-shrink-0"
                  >
                    {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCopyPassword}
                    className="h-5 w-5 p-0 text-gray-400 hover:text-white hover:bg-white/10 flex-shrink-0"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
                {credential.url && (
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-400 w-16 flex-shrink-0">URL:</span>
                    <a
                      href={credential.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline truncate flex-1 text-xs"
                    >
                      {credential.url}
                    </a>
                  </div>
                )}
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10 ml-2 h-6 w-6 p-0"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-gray-900/95 border-gray-700 text-white max-w-sm">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-sm">Delete Credential</AlertDialogTitle>
                  <AlertDialogDescription className="text-gray-400 text-xs">
                    Delete "{credential.title}"? This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-white/10 border-white/20 text-white hover:bg-white/20 text-xs">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete} className="bg-red-500 hover:bg-red-600 text-white text-xs">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    )
  },
)
CredentialCard.displayName = "CredentialCard"

// Simplified unlock screen
const UnlockScreen = memo<UnlockScreenProps>(({ masterPassword, setMasterPassword, onUnlock, hasError }) => {
  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && masterPassword) {
        onUnlock()
      }
    },
    [masterPassword, onUnlock],
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm bg-white/5 border-white/10 shadow-lg">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-3 w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <CardTitle className="text-xl font-bold text-white">CredStore</CardTitle>
          <CardDescription className="text-gray-300 text-sm">Secure Credential Manager</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="master-password" className="text-white text-sm">
              Master Password
            </Label>
            <Input
              id="master-password"
              type="password"
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
              className={`bg-white/5 border-white/20 text-white placeholder:text-gray-400 text-sm ${
                hasError ? "border-red-500" : ""
              }`}
              placeholder="Enter master password"
              onKeyPress={handleKeyPress}
              autoFocus
            />
            {hasError && <p className="text-red-400 text-xs">Invalid master password</p>}
          </div>
          <Button
            onClick={onUnlock}
            className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white border-0 text-sm"
            disabled={!masterPassword}
          >
            <Lock className="w-4 h-4 mr-2" />
            Unlock Vault
          </Button>
          <p className="text-xs text-gray-400 text-center">AES-256-GCM encrypted</p>
          <ResetCredStore />
        </CardContent>
      </Card>
    </div>
  )
})
UnlockScreen.displayName = "UnlockScreen"

export default function CredStore() {
  const [isLocked, setIsLocked] = useState(true)
  const [masterPassword, setMasterPassword] = useState("")
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [showPassword, setShowPassword] = useState<Set<string>>(new Set()) // Use Set for better performance
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [newCredential, setNewCredential] = useState({
    title: "",
    username: "",
    password: "",
    url: "",
    notes: "",
    category: "website" as const,
  })

  // Use refs to avoid recreating functions
  const saveTimeoutRef = useRef<NodeJS.Timeout>()
  const lastActivityRef = useRef(Date.now())

  // Cleanup function
  const cleanup = useCallback(() => {
    setMasterPassword("")
    setCredentials([])
    setShowPassword(new Set())
    setHasError(false)
    setSearchTerm("")
    setSelectedCategory("all")
    setNewCredential({
      title: "",
      username: "",
      password: "",
      url: "",
      notes: "",
      category: "website",
    })
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
  }, [])

  const handleLock = useCallback(() => {
    setIsLocked(true)
    cleanup()
  }, [cleanup])

  // Optimized save with debouncing
  const saveToStorage = useCallback(
    async (credentialsToSave: Credential[]) => {
      if (!masterPassword) return false

      try {
        // Clear previous timeout
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current)
        }

        // Debounce save operation
        return new Promise<boolean>((resolve) => {
          saveTimeoutRef.current = setTimeout(async () => {
            try {
              const dataToEncrypt = JSON.stringify(credentialsToSave)
              const encryptedData = await encryptData(dataToEncrypt, masterPassword)
              localStorage.setItem("credstore_data", JSON.stringify(encryptedData))
              resolve(true)
            } catch (error) {
              console.error("Save failed:", error)
              resolve(false)
            }
          }, 500) // 500ms debounce
        })
      } catch (error) {
        console.error("Save setup failed:", error)
        return false
      }
    },
    [masterPassword],
  )

  // Initialize app
  useEffect(() => {
    const savedData = localStorage.getItem("credstore_data")
    setIsLocked(true)
    if (!savedData) {
      cleanup()
    }
  }, [cleanup])

  // Auto-lock and cleanup
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && !isLocked) {
        handleLock()
      }
    }

    const handleBeforeUnload = () => {
      cleanup()
    }

    // Auto-lock timer
    const autoLockInterval = setInterval(() => {
      if (!isLocked && Date.now() - lastActivityRef.current > 300000) {
        // 5 minutes
        handleLock()
      }
    }, 30000) // Check every 30 seconds

    // Activity tracking
    const updateActivity = () => {
      lastActivityRef.current = Date.now()
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("beforeunload", handleBeforeUnload)
    document.addEventListener("mousedown", updateActivity)
    document.addEventListener("keydown", updateActivity)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("beforeunload", handleBeforeUnload)
      document.removeEventListener("mousedown", updateActivity)
      document.removeEventListener("keydown", updateActivity)
      clearInterval(autoLockInterval)
      cleanup()
    }
  }, [isLocked, handleLock, cleanup])

  // Optimized unlock
  const handleUnlock = useCallback(async () => {
    if (!masterPassword?.trim()) {
      setHasError(true)
      return
    }

    try {
      setHasError(false)
      const savedData = localStorage.getItem("credstore_data")

      if (savedData) {
        const encryptedData = JSON.parse(savedData)
        const decryptedData = await decryptData(encryptedData, masterPassword)
        const parsedCredentials = JSON.parse(decryptedData)

        if (Array.isArray(parsedCredentials)) {
          setCredentials(parsedCredentials)
          setIsLocked(false)
          lastActivityRef.current = Date.now()
        } else {
          throw new Error("Invalid data")
        }
      } else {
        setCredentials([])
        setIsLocked(false)
        lastActivityRef.current = Date.now()
      }
    } catch (error) {
      setHasError(true)
      setMasterPassword("")
    }
  }, [masterPassword])

  // Optimized password generation
  const generatePassword = useCallback(() => {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
    const array = new Uint8Array(12) // Reduced length
    crypto.getRandomValues(array)
    const password = Array.from(array, (byte) => charset[byte % charset.length]).join("")
    setNewCredential((prev) => ({ ...prev, password }))
  }, [])

  // Optimized credential operations
  const addCredential = useCallback(async () => {
    const credential: Credential = {
      id: Date.now().toString(),
      ...newCredential,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const updatedCredentials = [...credentials, credential]
    setCredentials(updatedCredentials)
    saveToStorage(updatedCredentials)

    setNewCredential({
      title: "",
      username: "",
      password: "",
      url: "",
      notes: "",
      category: "website",
    })
    setIsAddDialogOpen(false)
  }, [credentials, newCredential, saveToStorage])

  const deleteCredential = useCallback(
    async (id: string) => {
      const updatedCredentials = credentials.filter((cred) => cred.id !== id)
      setCredentials(updatedCredentials)
      saveToStorage(updatedCredentials)
      // Remove from showPassword set
      setShowPassword((prev) => {
        const newSet = new Set(prev)
        newSet.delete(id)
        return newSet
      })
    },
    [credentials, saveToStorage],
  )

  // Optimized clipboard copy
  const copyToClipboard = useCallback((text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {
        // Fallback
        const textArea = document.createElement("textarea")
        textArea.value = text
        textArea.style.position = "fixed"
        textArea.style.opacity = "0"
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand("copy")
        document.body.removeChild(textArea)
      })
    }
  }, [])

  const exportData = useCallback(() => {
    const dataStr = JSON.stringify(credentials, null, 2)
    const dataBlob = new Blob([dataStr], { type: "application/json" })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement("a")
    link.href = url
    link.download = `credstore-backup-${new Date().toISOString().split("T")[0]}.json`
    link.click()
    URL.revokeObjectURL(url)
  }, [credentials])

  const togglePasswordVisibility = useCallback((id: string) => {
    setShowPassword((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }, [])

  // Memoized filtered credentials with virtual scrolling consideration
  const filteredCredentials = useMemo(() => {
    if (!searchTerm && selectedCategory === "all") return credentials

    return credentials.filter((cred) => {
      const matchesSearch =
        !searchTerm ||
        cred.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cred.username.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesCategory = selectedCategory === "all" || cred.category === selectedCategory
      return matchesSearch && matchesCategory
    })
  }, [credentials, searchTerm, selectedCategory])

  if (isLocked) {
    return (
      <UnlockScreen
        masterPassword={masterPassword}
        setMasterPassword={setMasterPassword}
        onUnlock={handleUnlock}
        hasError={hasError}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="container mx-auto p-3 space-y-4 max-w-4xl">
        {/* Compact Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">CredStore</h1>
              <p className="text-gray-300 text-xs">{credentials.length} credentials</p>
            </div>
          </div>
          <div className="flex items-center space-x-1">
            <Button
              onClick={exportData}
              variant="outline"
              size="sm"
              className="bg-white/5 border-white/20 text-white hover:bg-white/10 text-xs px-2 py-1"
            >
              <Download className="w-3 h-3 mr-1" />
              Export
            </Button>
            <Button
              onClick={handleLock}
              variant="outline"
              size="sm"
              className="bg-white/5 border-white/20 text-white hover:bg-white/10 text-xs px-2 py-1"
            >
              <LogOut className="w-3 h-3 mr-1" />
              Lock
            </Button>
          </div>
        </div>

        {/* Compact Search and Filter */}
        <Card className="bg-white/5 border-white/10 shadow-sm">
          <CardContent className="p-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-3 h-3" />
                <Input
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-7 bg-white/5 border-white/20 text-white placeholder:text-gray-400 text-sm h-8"
                />
              </div>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full sm:w-32 bg-white/5 border-white/20 text-white text-sm h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-900/95 border-gray-700">
                  <SelectItem value="all" className="text-white hover:bg-white/10 text-sm">
                    All
                  </SelectItem>
                  <SelectItem value="website" className="text-white hover:bg-white/10 text-sm">
                    Web
                  </SelectItem>
                  <SelectItem value="api" className="text-white hover:bg-white/10 text-sm">
                    API
                  </SelectItem>
                  <SelectItem value="database" className="text-white hover:bg-white/10 text-sm">
                    DB
                  </SelectItem>
                  <SelectItem value="other" className="text-white hover:bg-white/10 text-sm">
                    Other
                  </SelectItem>
                </SelectContent>
              </Select>
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white text-sm h-8 px-3">
                    <Plus className="w-3 h-3 mr-1" />
                    Add
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-gray-900/95 border-gray-700 text-white max-w-sm">
                  <DialogHeader>
                    <DialogTitle className="text-sm">Add Credential</DialogTitle>
                    <DialogDescription className="text-gray-400 text-xs">
                      Store a new credential securely.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="title" className="text-xs">
                        Title
                      </Label>
                      <Input
                        id="title"
                        value={newCredential.title}
                        onChange={(e) => setNewCredential((prev) => ({ ...prev, title: e.target.value }))}
                        className="bg-white/5 border-white/20 text-white text-sm h-8"
                        placeholder="Gmail Account"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="username" className="text-xs">
                        Username
                      </Label>
                      <Input
                        id="username"
                        value={newCredential.username}
                        onChange={(e) => setNewCredential((prev) => ({ ...prev, username: e.target.value }))}
                        className="bg-white/5 border-white/20 text-white text-sm h-8"
                        placeholder="user@example.com"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="password" className="text-xs">
                        Password
                      </Label>
                      <div className="flex space-x-1">
                        <Input
                          id="password"
                          value={newCredential.password}
                          onChange={(e) => setNewCredential((prev) => ({ ...prev, password: e.target.value }))}
                          className="bg-white/5 border-white/20 text-white flex-1 text-sm h-8"
                          placeholder="Password"
                        />
                        <Button
                          type="button"
                          onClick={generatePassword}
                          variant="outline"
                          className="bg-white/5 border-white/20 text-white hover:bg-white/10 text-xs px-2 h-8"
                        >
                          Gen
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="category" className="text-xs">
                        Category
                      </Label>
                      <Select
                        value={newCredential.category}
                        onValueChange={(value: any) => setNewCredential((prev) => ({ ...prev, category: value }))}
                      >
                        <SelectTrigger className="bg-white/5 border-white/20 text-white text-sm h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-900/95 border-gray-700">
                          <SelectItem value="website" className="text-white hover:bg-white/10 text-sm">
                            Website
                          </SelectItem>
                          <SelectItem value="api" className="text-white hover:bg-white/10 text-sm">
                            API Key
                          </SelectItem>
                          <SelectItem value="database" className="text-white hover:bg-white/10 text-sm">
                            Database
                          </SelectItem>
                          <SelectItem value="other" className="text-white hover:bg-white/10 text-sm">
                            Other
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      onClick={addCredential}
                      className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-sm h-8"
                      disabled={!newCredential.title || !newCredential.username || !newCredential.password}
                    >
                      Add Credential
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        {/* Optimized Credentials List */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filteredCredentials.length === 0 ? (
            <Card className="bg-white/5 border-white/10 shadow-sm">
              <CardContent className="p-6 text-center">
                <Shield className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <h3 className="text-lg font-medium text-white mb-1">No credentials found</h3>
                <p className="text-gray-400 text-sm">
                  {searchTerm || selectedCategory !== "all"
                    ? "Try adjusting your search."
                    : "Add your first credential."}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredCredentials.map((credential) => (
              <CredentialCard
                key={credential.id}
                credential={credential}
                showPassword={showPassword.has(credential.id)}
                onTogglePassword={() => togglePasswordVisibility(credential.id)}
                onCopyToClipboard={copyToClipboard}
                onDelete={() => deleteCredential(credential.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
