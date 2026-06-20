---
name: Expo dev server stalls on login prompt (Expo Go "loads then times out")
description: Why the Replit Expo workflow can wedge so Expo Go never finishes loading, and the EXPO_OFFLINE fix that keeps hot-reload.
---

# `npx expo start` can stall the dev server on an interactive prompt → Expo Go "loads then times out"

Symptom: user opens the app in Expo Go, it starts loading then fails/times out.
Frontend workflow logs show `npx expo start` repeatedly sitting on:
`It is recommended to log in with your Expo account before proceeding` →
`Log in / Proceed anonymously`. Metro prints "waiting on ..." but never finishes
serving the bundle because the CLI is blocked waiting on stdin the workflow can't provide.

**Fix that works — make expo non-interactive WITHOUT killing hot-reload:** set
`EXPO_OFFLINE=1` on the workflow command (e.g. `EXPO_OFFLINE=1 npm run expo:dev`).
Offline mode skips the Expo-account/login network check (so no prompt) while
**keeping Metro watch mode / hot-reload enabled**.

**Do NOT use `CI=1` for this.** It also skips the prompt, but Metro then logs
"running in CI mode, reloads are disabled" — hot-reload is gone, which breaks the
live-edit dev loop. `CI=1` also refuses to auto-resolve other prompts (e.g. a port
conflict) and just exits with "Skipping dev server".

**Companion gotcha — stale Metro holding port 8081:** a previously wedged
`expo start` run can keep its whole process tree alive holding port 8081 even after
the workflow is reconfigured/restarted. The next start then hits "Port 8081 is being
used by another process". Free 8081 by killing the stale `expo start`/`expo:dev`
process tree (`ps -eo pid,lstart,args | rg "expo start"` then `kill -9`). Do NOT let
it fall back to 8082 — the Replit preview/proxy expects the Expo dev server on 8081.

**Why:** this is a dev-environment-only issue (production serves prebuilt static
bundles, unaffected). The login prompt appears for an unverified app when the CLI
isn't logged in; a non-TTY workflow can't answer it, so the server wedges.

**How to apply:** if Expo Go won't finish loading and frontend logs show the login
prompt or a port-8081 conflict, set `EXPO_OFFLINE=1` on the start command, kill any
stale expo process tree to free 8081, restart `Start Frontend`, then verify by
compiling the bundle: `curl http://localhost:8081/<main-entry>.bundle?platform=ios`
should return HTTP 200 (entry path comes from package.json `main`, here `client/index.js`).
