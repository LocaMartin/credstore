const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "authorization,content-type",
  "access-control-max-age": "86400",
};

const encoder = new TextEncoder();
const maxJsonBytes = 1_500_000;

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    try {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/") return text("CredStore worker is running.");
      if (request.method === "POST" && url.pathname === "/licenses") return await handleLicense(request, env);
      if (request.method === "POST" && url.pathname === "/contact") return await storePublicRecord(request, env, "feedback");
      if (request.method === "POST" && url.pathname === "/complaints") {
        return await storePublicRecord(request, env, "complaint");
      }
      if (request.method === "POST" && url.pathname === "/bugs") return await storePublicRecord(request, env, "bug");
      if (request.method === "GET" && url.pathname === "/tickets/chat") return await handlePublicChatRead(env, url);
      if (request.method === "POST" && url.pathname === "/tickets/chat") return await handlePublicChatWrite(request, env);
      if (request.method === "GET" && url.pathname === "/hall-of-fame") return await listPublicHall(env);
      if (request.method === "GET" && url.pathname === "/admin/items") return await handleAdminItems(request, env);
      if (request.method === "GET" && url.pathname === "/admin/search") return await handleAdminSearch(request, env, url);
      if (request.method === "GET" && url.pathname === "/admin/ticket/chat") return await handleAdminChatRead(request, env, url);
      if (request.method === "POST" && url.pathname === "/admin/ticket/chat") return await handleAdminChatWrite(request, env);
      if (request.method === "POST" && url.pathname === "/admin/response") return await handleAdminResponse(request, env);
      if (request.method === "POST" && url.pathname === "/admin/hall-of-fame") return await handleHallWrite(request, env);
      if (request.method === "POST" && url.pathname === "/admin/certificate-template") {
        return await handleCertificateTemplate(request, env);
      }
      return json({ error: "Not found" }, 404);
    } catch (error) {
      if (error instanceof PublicError) return json({ error: error.message }, error.status);
      console.error(JSON.stringify({ level: "error", message: error?.message || "worker error" }));
      return json({ error: "Server error" }, 500);
    }
  },
};

async function handleLicense(request, env) {
  const input = await readJson(request);
  const kind = sanitizeChoice(input.kind, ["lifetime", "trial"], "trial");
  const company = sanitizeText(input.company, 120);
  const buyerEmail = sanitizeEmail(input.buyerEmail);
  const accountIdentity = sanitizeText(input.accountIdentity, 220);
  const paymentProvider = sanitizeChoice(input.paymentProvider, ["upi", "paypal", "card", "crypto", "trial"], "trial");
  const paymentReference = sanitizeText(input.paymentReference, 180);

  if (!company || !buyerEmail || !accountIdentity) {
    throw new PublicError("Company, email, and CredStore account identity are required.", 400);
  }
  if (kind === "lifetime" && !paymentReference && env.ALLOW_UNPAID_LIFETIME !== "true") {
    throw new PublicError("Payment reference is required for paid licenses.", 402);
  }

  const now = new Date();
  const expiresAt = kind === "trial" ? new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString() : undefined;
  const payload = {
    alg: "Ed25519",
    plan: kind === "trial" ? "trial" : "enterprise",
    kind,
    licenseId: `credstore-${kind}-${crypto.randomUUID()}`,
    company,
    buyerEmail,
    accountIdentity,
    maxDevices: kind === "trial" ? 5 : 50,
    maxUsers: kind === "trial" ? 5 : 50,
    paymentProvider,
    paymentReference,
    issuedAt: now.toISOString(),
    expiresAt,
    features: ["offline-vault", "one-time-qr-sync", "biometric-unlock", "offline-license-validation"],
  };

  const license = await signLicense(payload, env);
  await putRecord(env, "license", {
    ...payload,
    licensePreview: `${license.slice(0, 28)}...${license.slice(-12)}`,
  });
  return json({ license, payload, message: "Ed25519 offline license generated." });
}

async function signLicense(payload, env) {
  if (!env.LICENSE_PRIVATE_JWK) throw new Error("LICENSE_PRIVATE_JWK is not configured");
  const key = await crypto.subtle.importKey(
    "jwk",
    JSON.parse(env.LICENSE_PRIVATE_JWK),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key, encoder.encode(payloadPart)));
  return `${payloadPart}.${base64UrlEncode(signature)}`;
}

async function storePublicRecord(request, env, type) {
  const input = await readJson(request);
  const record = {
    type,
    name: sanitizeText(input.name || input.hunterName || "", 120),
    hunterName: sanitizeText(input.hunterName || "", 120),
    email: sanitizeEmail(input.email),
    company: sanitizeText(input.company || "", 120),
    title: sanitizeText(input.title || "", 180),
    severity: sanitizeText(input.severity || "", 32),
    cvssScore: sanitizeText(input.cvssScore || "", 12),
    affectedVersion: sanitizeText(input.affectedVersion || "", 120),
    profileUrl: sanitizeUrl(input.profileUrl || ""),
    remediation: sanitizeText(input.remediation || "", 1200),
    transactionId: sanitizeText(input.transactionId || "", 180),
    message: sanitizeText(input.message || "", 6000),
    screenshot: sanitizeDataUrl(input.screenshot || "", { allowWebp: type !== "bug" }),
    response: "",
    chat: [],
  };

  if (!record.email || !record.message) throw new PublicError("Email and message are required.", 400);
  if (type === "complaint" && !record.transactionId) throw new PublicError("Transaction ID is required.", 400);
  if (type === "bug" && (!record.hunterName || !record.title)) {
    throw new PublicError("Hunter name and bug title are required.", 400);
  }

  record.chat.push({
    id: crypto.randomUUID(),
    sender: "reporter",
    message: record.message,
    createdAt: new Date().toISOString(),
  });
  const saved = await putRecord(env, type, record);
  return json({ ok: true, id: saved.id });
}

async function handleAdminItems(request, env) {
  const admin = await requireAdmin(request, env);
  const [feedback, complaints, bugs, hall, licenses] = await Promise.all([
    listRecords(env, "feedback"),
    listRecords(env, "complaint"),
    listRecords(env, "bug"),
    listRecords(env, "hall"),
    listRecords(env, "license"),
  ]);
  return json({ adminEmail: admin.email, feedback, complaints, bugs, hall, licenses });
}

async function handleAdminSearch(request, env, url) {
  await requireAdmin(request, env);
  const transactionId = sanitizeText(url.searchParams.get("transactionId") || "", 180).toLowerCase();
  if (!transactionId) return json({ items: [] });
  const [complaints, licenses] = await Promise.all([listRecords(env, "complaint"), listRecords(env, "license")]);
  const items = [...complaints, ...licenses].filter((item) =>
    String(item.transactionId || item.paymentReference || "").toLowerCase().includes(transactionId),
  );
  return json({ items });
}

async function handleAdminResponse(request, env) {
  await requireAdmin(request, env);
  const input = await readJson(request);
  const id = sanitizeText(input.id, 120);
  const status = sanitizeChoice(input.status, ["new", "reviewing", "waiting-payment-check", "resolved", "rejected"], "new");
  const response = sanitizeText(input.response || "", 2000);
  const key = await findRecordKey(env, id);
  if (!key) throw new PublicError("Ticket ID not found.", 404);
  const record = await env.CREDSTORE_DATA.get(key, "json");
  const updated = { ...record, status, response, updatedAt: new Date().toISOString() };
  await env.CREDSTORE_DATA.put(key, JSON.stringify(updated));
  return json({ ok: true, item: updated });
}

async function handlePublicChatRead(env, url) {
  const { record } = await requirePublicTicket(env, url.searchParams.get("id"), url.searchParams.get("email"));
  return json({
    id: record.id,
    status: record.status,
    response: record.response || "",
    messages: record.chat || [],
  });
}

async function handlePublicChatWrite(request, env) {
  const input = await readJson(request);
  const email = sanitizeEmail(input.email);
  const { key, record } = await requirePublicTicket(env, input.id, email);
  const message = sanitizeText(input.message || "", 6000);
  if (!message) throw new PublicError("Message is required.", 400);
  const chat = [...(record.chat || []), createChatMessage("reporter", message, input)];
  const updated = { ...record, chat, status: record.status === "resolved" ? "reviewing" : record.status, updatedAt: new Date().toISOString() };
  await env.CREDSTORE_DATA.put(key, JSON.stringify(updated));
  return json({ ok: true, messages: chat });
}

async function handleAdminChatRead(request, env, url) {
  await requireAdmin(request, env);
  const id = sanitizeText(url.searchParams.get("id") || "", 120);
  const key = await findRecordKey(env, id);
  if (!key) throw new PublicError("Ticket ID not found.", 404);
  const record = await env.CREDSTORE_DATA.get(key, "json");
  return json({ id: record.id, status: record.status, response: record.response || "", messages: record.chat || [] });
}

async function handleAdminChatWrite(request, env) {
  const admin = await requireAdmin(request, env);
  const input = await readJson(request);
  const id = sanitizeText(input.id, 120);
  const key = await findRecordKey(env, id);
  if (!key) throw new PublicError("Ticket ID not found.", 404);
  const record = await env.CREDSTORE_DATA.get(key, "json");
  const message = sanitizeText(input.message || "", 6000);
  if (!message && !input.attachmentData) throw new PublicError("Message or attachment is required.", 400);
  const chat = [...(record.chat || []), createChatMessage(`admin:${admin.email}`, message, input)];
  const updated = { ...record, chat, status: "reviewing", updatedAt: new Date().toISOString() };
  await env.CREDSTORE_DATA.put(key, JSON.stringify(updated));
  return json({ ok: true, messages: chat });
}

async function handleHallWrite(request, env) {
  await requireAdmin(request, env);
  const input = await readJson(request);
  const record = {
    type: "hall",
    name: sanitizeText(input.name, 120),
    title: sanitizeText(input.title, 180),
    severity: sanitizeText(input.severity, 32),
    cvssScore: sanitizeText(input.cvssScore || "", 12),
    affectedVersion: sanitizeText(input.affectedVersion || "", 120),
    profileUrl: sanitizeUrl(input.profileUrl || ""),
    remediation: sanitizeText(input.remediation || "", 1200),
    message: sanitizeText(input.message || "", 1200),
    public: true,
  };
  if (!record.name || !record.title) throw new PublicError("Name and recognition title are required.", 400);
  const saved = await putRecord(env, "hall", record);
  return json({ ok: true, id: saved.id });
}

async function handleCertificateTemplate(request, env) {
  await requireAdmin(request, env);
  const input = await readJson(request);
  const template = {
    hunterName: sanitizeText(input.hunterName || "", 120),
    severity: sanitizeText(input.severity || "", 32),
    title: sanitizeText(input.title || "", 180),
    note: sanitizeText(input.note || "", 1200),
    updatedAt: new Date().toISOString(),
  };
  await env.CREDSTORE_DATA.put("settings:certificate-template", JSON.stringify(template));
  return json({ ok: true, template });
}

async function listPublicHall(env) {
  const hall = await listRecords(env, "hall");
  return json({ items: hall.filter((entry) => entry.public !== false) });
}

async function findRecordKey(env, id) {
  const prefixes = ["feedback:", "complaint:", "bug:", "hall:", "license:"];
  for (const prefix of prefixes) {
    const key = `${prefix}${id}`;
    if (await env.CREDSTORE_DATA.get(key)) return key;
  }
  return "";
}

async function requirePublicTicket(env, rawId, rawEmail) {
  const id = sanitizeText(rawId, 120);
  const email = sanitizeEmail(rawEmail);
  if (!id || !email) throw new PublicError("Ticket ID and email are required.", 400);
  const key = await findRecordKey(env, id);
  if (!key) throw new PublicError("Ticket ID not found.", 404);
  const record = await env.CREDSTORE_DATA.get(key, "json");
  if (String(record.email || "").toLowerCase() !== email) {
    throw new PublicError("Ticket email does not match.", 403);
  }
  return { key, record };
}

function createChatMessage(sender, message, input) {
  const attachment = sanitizeAttachment(input);
  return {
    id: crypto.randomUUID(),
    sender,
    message,
    attachment,
    createdAt: new Date().toISOString(),
  };
}

async function putRecord(env, type, record) {
  const id = `${Date.now()}-${crypto.randomUUID()}`;
  const saved = { id, createdAt: new Date().toISOString(), status: "new", ...record };
  await env.CREDSTORE_DATA.put(`${type}:${id}`, JSON.stringify(saved));
  return saved;
}

async function listRecords(env, type) {
  const listed = await env.CREDSTORE_DATA.list({ prefix: `${type}:`, limit: 100 });
  const records = await Promise.all(listed.keys.map((key) => env.CREDSTORE_DATA.get(key.name, "json")));
  return records.filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function requireAdmin(request, env) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new PublicError("Admin login required.", 401);
  const info = await verifyGoogleToken(token, env);
  const allowed = String(env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.includes(String(info.email || "").toLowerCase())) {
    throw new PublicError("This Google account is not allowed for CredStore admin.", 403);
  }
  return info;
}

async function verifyGoogleToken(token, env) {
  const clientId = env.GOOGLE_CLIENT_ID || "7346060566-39riegeih7sclmbcfenvqg9l2ggn0fnh.apps.googleusercontent.com";
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`, {
    headers: { accept: "application/json" },
  });
  const info = await response.json();
  if (!response.ok) throw new PublicError("Google login verification failed.", 401);
  if (info.aud !== clientId) throw new PublicError("Google token audience mismatch.", 401);
  if (info.email_verified !== "true" && info.email_verified !== true) {
    throw new PublicError("Google account email is not verified.", 401);
  }
  return info;
}

async function readJson(request) {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > maxJsonBytes) throw new PublicError("Request is too large.", 413);
  try {
    return await request.json();
  } catch {
    throw new PublicError("Invalid JSON.", 400);
  }
}

function sanitizeText(value, maxLength) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function sanitizeEmail(value) {
  const email = sanitizeText(value, 180).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function sanitizeUrl(value) {
  const url = sanitizeText(value, 240);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function sanitizeChoice(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function sanitizeDataUrl(value, options = {}) {
  const dataUrl = String(value || "");
  if (!dataUrl) return "";
  if (dataUrl.length > maxJsonBytes) throw new PublicError("Screenshot is too large.", 413);
  const allowed = options.allowWebp === false ? "png|jpeg" : "png|jpeg|webp";
  const match = dataUrl.match(new RegExp(`^data:image\\/(${allowed});base64,([a-z0-9+/=]+)$`, "i"));
  if (!match) {
    throw new PublicError(
      options.allowWebp === false
        ? "Screenshot must be a PNG or JPEG image."
        : "Screenshot must be a PNG, JPEG, or WebP image.",
      400,
    );
  }
  const mime = match[1].toLowerCase();
  let bytes;
  try {
    bytes = Uint8Array.from(atob(match[2].slice(0, 32)), (char) => char.charCodeAt(0));
  } catch {
    throw new PublicError("Screenshot is not valid base64 image data.", 400);
  }
  const isPng =
    mime === "png" &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const isJpeg = mime === "jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp =
    options.allowWebp !== false &&
    mime === "webp" &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;
  if (!isPng && !isJpeg && !isWebp) {
    throw new PublicError("Screenshot file signature does not match the declared image type.", 400);
  }
  return dataUrl;
}

function sanitizeAttachment(input) {
  const data = String(input.attachmentData || "");
  const name = sanitizeText(input.attachmentName || "", 180);
  if (!data) return null;
  if (data.length > maxJsonBytes) throw new PublicError("Attachment is too large.", 413);
  if (!/^data:(application\/pdf|image\/(png|jpeg|webp));base64,[a-z0-9+/=]+$/i.test(data)) {
    throw new PublicError("Only PDF, PNG, JPEG, or WebP chat attachments are supported.", 400);
  }
  return { name: name || "credstore-attachment", data };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function text(body, status = 200) {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

function base64UrlEncode(value) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

class PublicError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
