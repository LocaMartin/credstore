const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,x-credstore-test-secret",
}

const encoder = new TextEncoder()

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return json({}, 204)
    }

    const url = new URL(request.url)

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, service: "credstore-license-worker" })
      }

      if (request.method === "POST" && url.pathname === "/licenses") {
        return handleLicense(request, env)
      }

      if (request.method === "POST" && url.pathname === "/contact") {
        return handleContact(request, env)
      }

      return json({ error: "Not found" }, 404)
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Server error" }, 500)
    }
  },
}

async function handleLicense(request, env) {
  const body = await request.json()
  const kind = sanitize(body.kind || "lifetime", 24)
  const company = sanitize(body.company, 120)
  const buyerEmail = sanitize(body.buyerEmail, 160)
  const paymentProvider = sanitize(body.paymentProvider, 32)
  const paymentReference = sanitize(body.paymentReference, 180)

  if (!company || !buyerEmail) {
    return json({ error: "Company and email are required." }, 400)
  }

  if (kind === "lifetime" && !paymentReference && env.ALLOW_UNPAID_LIFETIME !== "true") {
    return json({ error: "Payment reference is required for lifetime licenses." }, 402)
  }

  if (kind === "test") {
    const providedSecret = request.headers.get("x-credstore-test-secret") || body.testSecret
    if (!env.TEST_KEY_SECRET || providedSecret !== env.TEST_KEY_SECRET) {
      return json({ error: "Test license secret is invalid." }, 403)
    }
  }

  const issuedAt = new Date()
  const payload = {
    plan: "enterprise",
    kind,
    licenseId: `credstore-${kind}-${crypto.randomUUID()}`,
    company,
    buyerEmail,
    maxDevices: kind === "trial" ? 10 : 50,
    maxUsers: kind === "trial" ? 10 : 50,
    issuedAt: issuedAt.toISOString(),
    expiresAt: kind === "trial" ? new Date(issuedAt.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString() : undefined,
    paymentProvider,
    paymentReference,
    priceUsd: kind === "lifetime" ? 100 : 0,
    features: [
      "premium-sync",
      "employee-profiles",
      "admin-controls",
      "visibility-controls",
      "customization-feedback",
    ],
  }

  const license = await signLicense(payload, env)

  return json({
    license,
    payload,
    message: kind === "trial" ? "5-day trial license generated." : "Lifetime license generated.",
  })
}

async function handleContact(request, env) {
  const body = await request.json()
  const message = {
    id: crypto.randomUUID(),
    name: sanitize(body.name, 120),
    email: sanitize(body.email, 160),
    message: sanitize(body.message, 4000),
    createdAt: new Date().toISOString(),
  }

  if (!message.name || !message.email || !message.message) {
    return json({ error: "Name, email, and message are required." }, 400)
  }

  if (env.CONTACT_KV) {
    await env.CONTACT_KV.put(`contact:${message.createdAt}:${message.id}`, JSON.stringify(message))
  }

  if (env.CONTACT_WEBHOOK_URL) {
    await fetch(env.CONTACT_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message),
    })
  }

  return json({ ok: true })
}

async function signLicense(payload, env) {
  if (!env.LICENSE_PRIVATE_JWK) {
    throw new Error("LICENSE_PRIVATE_JWK Worker secret is not configured.")
  }

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    JSON.parse(env.LICENSE_PRIVATE_JWK),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  )
  const payloadPart = base64Url(encoder.encode(JSON.stringify(payload)))
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, encoder.encode(payloadPart))
  return `${payloadPart}.${base64Url(new Uint8Array(signature))}`
}

function sanitize(value, maxLength) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength)
}

function base64Url(bytes) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function json(payload, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "content-type": "application/json; charset=utf-8",
    },
  })
}
