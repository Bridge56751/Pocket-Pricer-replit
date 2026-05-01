/**
 * Loads environment variables from .env.local (preferred) and .env (fallback)
 * before any other server module reads process.env.
 *
 * IMPORTANT: this module must be the very first import in server/index.ts.
 * ES module imports run in source order, so by importing this file first we
 * guarantee process.env is populated before server/db.ts and server/supabase.ts
 * (which both throw at module load time if SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 * are missing) get evaluated.
 *
 * On Replit (development or production), neither .env.local nor .env exists —
 * env vars are injected at runtime by Replit's Secrets manager and this loader
 * is a no-op. On a local Mac / Linux dev box, .env.local supplies the secrets.
 * See README "Local Development" for the workflow.
 */
import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = process.cwd();
const envFiles = [".env.local", ".env"];

for (const file of envFiles) {
  const fullPath = resolve(projectRoot, file);
  if (existsSync(fullPath)) {
    dotenv.config({ path: fullPath, override: false });
  }
}
