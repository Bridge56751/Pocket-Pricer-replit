---
name: Production POST aborts with "request aborted, received: 0"
description: Why scan/upload POSTs die at the body parser only in production, and the server-side keep-alive fix.
---

# "BadRequestError: request aborted (received: 0)" on POSTs = reverse-proxy keep-alive race

Symptom: in the deployed app, every POST that carries a sizable body (e.g. the
base64 scan upload, ~90–230KB) aborts in Express's body parser with
`BadRequestError: request aborted` / `code: ECONNABORTED` / `received: 0` BEFORE
the route handler runs. GET requests on the same domain succeed. The same code in
the dev backend handles identical payloads fine. Net effect: the feature looks
dead (e.g. "scan failed", and downstream APIs like SearchAPI never get called).

**Root cause:** behind the Replit deployment edge (a reverse proxy) the edge keeps
persistent keep-alive connections to the origin and reuses them. Node's default
`server.keepAliveTimeout` is only 5s, so the proxy can dispatch a request onto a
socket Node is simultaneously closing; the body never lands → `received: 0`.

**Fix (server-side, in the http.Server returned by registerRoutes, before listen):**
```js
server.keepAliveTimeout = 75_000; // comfortably above the proxy idle window
server.headersTimeout   = 80_000; // MUST be > keepAliveTimeout (Node requirement)
```
**Why these values:** keepAliveTimeout must exceed the proxy's idle timeout so the
origin never closes a socket the proxy still considers live; headersTimeout must be
strictly greater than keepAliveTimeout or headers can be cut off mid-stream.

**How to confirm it's this and not app logic:** body-size limits produce 4xx/413,
not abort-at-zero; real handler/validation failures leave handler log lines — here
there are none. A direct curl POST that uploads its full body (size_upload == the
content length) while the origin still logs `received: 0` is the smoking gun that
the abort is at the transport/proxy layer, not the app.

**Don't confuse with edge abuse-blocking:** rapid automated POSTs from one IP get a
plain-HTML 403 from the edge (distinct from the app's JSON 403). That throttles the
*test* IP and is not the user-facing failure.
