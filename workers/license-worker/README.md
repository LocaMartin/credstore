# CredStore License Worker

Cloudflare Worker for issuing signed offline CredStore Pro/Enterprise licenses.

Required secret:

```bash
wrangler secret put LICENSE_PRIVATE_JWK
```

Optional configuration:

```bash
wrangler secret put TEST_KEY_SECRET
wrangler secret put CONTACT_WEBHOOK_URL
```

Optional KV binding:

```toml
[[kv_namespaces]]
binding = "CONTACT_KV"
id = "your-kv-id"
```

Do not commit `LICENSE_PRIVATE_JWK`. The app ships only the public key and verifies tokens offline.
