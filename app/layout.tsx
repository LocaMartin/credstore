import type React from "react"
import type { Metadata, Viewport } from "next" // Add Viewport type
import { Inter } from 'next/font/google'
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "CredStore - Secure Offline Credential Manager",
  description:
    "A secure, offline credential management system with AES-256 encryption. Store passwords, API keys, and credentials safely with glassmorphism design.",
  keywords: ["password manager", "credential manager", "security", "encryption", "offline", "vault"],
  authors: [{ name: "CredStore Team", url: "https://github.com/LocaMartin/credstore" }],
  creator: "CredStore",
  publisher: "CredStore",
  robots: "noindex, nofollow",
  // Remove viewport from here
}

// Add this new export
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#6366f1"
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="CredStore" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}