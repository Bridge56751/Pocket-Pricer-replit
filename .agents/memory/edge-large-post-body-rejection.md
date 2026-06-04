---
name: Replit deployment edge rejects large POST bodies ("received: 0")
description: Why sizable POSTs die before reaching Express only in production, and the client-direct-upload fix that bypasses the edge.
---

# Large POST bodies are dropped by the Replit deployment edge → Express body parser aborts with "received: 0"

Symptom: in the DEPLOYED app, every POST carrying a sizable body (e.g. a base64
scan image, ~90–230KB) aborts in Express's body parser with
`BadRequestError: request aborted` / `received: 0` BEFORE the route handler runs.
GET requests on the same domain succeed. The dev backend handles the identical
payload fine. Net effect: the feature looks dead ("scan failed"); downstream
providers (SearchAPI etc.) are never called.

**Proven root cause:** the Replit deployment EDGE (reverse proxy) drops/rejects
the request BODY above some size before it reaches the origin. A tiny POST (a few
bytes) reaches Express and gets a normal app JSON response; a large POST aborts at
`received: 0`. GETs share the same headers/cookies and work, so it is NOT an
oversized-header 403 and NOT app logic.

**What did NOT fix it:** raising `server.keepAliveTimeout` / `headersTimeout` in
the origin (an earlier keep-alive-race hypothesis). It is harmless but ineffective
— the body never reaches the origin at all, so an origin-socket timeout is the
wrong layer.

**Fix that works — keep the request body tiny:** upload the large payload from the
CLIENT directly to object storage, then send only a small URL to the API.
- Server mints a short-lived **Supabase signed upload URL** (`createSignedUploadUrl`,
  service-role key; signed upload URLs bypass RLS so the client needs no anon key
  and no bucket policy) and returns `{signedUrl, path, publicUrl}`.
- Client PUTs the binary straight to `signedUrl` (RN: `expo-file-system/legacy`
  `uploadAsync` with `BINARY_CONTENT`), then calls the scan API with `{imageUrl}`.
- Server scan handler accepts `{imageUrl}` in addition to `{imageBase64}`.

**Security when accepting a client-supplied `imageUrl`:** only grant
tracking/delete (prune) authority when the URL starts with the EXACT
`<SUPABASE_URL>/storage/v1/object/public/scan-images/` prefix AND the remaining
segment is a safe single filename (`^[A-Za-z0-9._-]+$`). Otherwise an attacker can
pass any `/scan-images/`-containing or traversal URL and make the no-results
cleanup path delete an arbitrary object.

**Rate limiting:** the upload-URL mint is the first half of every scan; give it its
OWN limiter bucket, or one scan consumes two units of the scan limiter and halves
throughput.

**How to confirm it's the edge and not app logic:** body-size *app* limits return
4xx/413, not abort-at-zero; real handler/validation failures leave handler log
lines. A direct curl POST whose `size_upload` equals the content length while the
origin still logs `received: 0` is the smoking gun. Separately, rapid automated
POSTs from one IP get a plain-HTML 403 from the edge (distinct from the app's JSON
403) — that only throttles the *test* IP, not real users.
