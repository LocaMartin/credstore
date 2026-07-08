import type React from "react"
import type { Metadata, Viewport } from "next"
import "./globals.css"

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'none'",
  "font-src 'self' data:",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
].join("; ")

export const metadata: Metadata = {
  title: "CredStore - Secure Offline Credential Manager",
  description:
    "A secure, offline credential management system with AES-256 encryption. Store passwords, API keys, and credentials safely with glassmorphism design.",
  keywords: ["password manager", "credential manager", "security", "encryption", "offline", "vault"],
  authors: [{ name: "CredStore Team" }],
  creator: "CredStore",
  publisher: "CredStore",
  robots: "noindex, nofollow",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#6366f1",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta httpEquiv="Content-Security-Policy" content={contentSecurityPolicy} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="CredStore" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
