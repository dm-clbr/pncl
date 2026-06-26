#!/usr/bin/env node
/**
 * One-time reset: delete all portal W-9 submissions and require agents to complete
 * the new fillable-PDF W-9 flow again.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/reset-portal-w9.mjs --dry-run
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/reset-portal-w9.mjs --confirm
 *
 * Reads VITE_SUPABASE_URL from .env.local when present.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const W9_TODO_SLUG = "w9_setup";
const W9_BUCKET = "portal-profile-documents";

function loadEnvLocal() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return;

  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function getArg(name) {
  return process.argv.includes(name);
}

async function listAllUsers(adminClient) {
  const users = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    users.push(...(data.users ?? []));
    if ((data.users?.length ?? 0) < perPage) break;
    page += 1;
  }

  return users;
}

async function main() {
  loadEnvLocal();

  const dryRun = getArg("--dry-run");
  const confirm = getArg("--confirm");

  if (!dryRun && !confirm) {
    console.error("Pass --dry-run to preview or --confirm to execute the reset.");
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error("Set SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_URL (or SUPABASE_URL).");
    process.exit(1);
  }

  const adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: w9Rows, error: w9Error } = await adminClient
    .from("portal_w9_forms")
    .select("user_id, pdf_path, legal_name, signed_at");

  if (w9Error) throw w9Error;

  const rows = w9Rows ?? [];
  const storagePaths = rows.map((row) => row.pdf_path?.trim() || `${row.user_id}/w9.pdf`);
  const uniquePaths = [...new Set(storagePaths)];

  const users = await listAllUsers(adminClient);
  const usersWithTodo = users.filter((user) => {
    const completed = user.user_metadata?.completed_portal_todos;
    return completed && typeof completed === "object" && !Array.isArray(completed)
      && completed[W9_TODO_SLUG] === true;
  });

  console.log(`${dryRun ? "[DRY RUN] " : ""}Portal W-9 reset plan:`);
  console.log(`  W-9 records to delete: ${rows.length}`);
  console.log(`  Storage PDFs to delete: ${uniquePaths.length}`);
  console.log(`  Users with ${W9_TODO_SLUG} todo to clear: ${usersWithTodo.length}`);

  if (rows.length > 0) {
    console.log("\nSample submissions:");
    for (const row of rows.slice(0, 5)) {
      console.log(`  - ${row.legal_name} (${row.user_id}) signed ${row.signed_at}`);
    }
    if (rows.length > 5) console.log(`  ... and ${rows.length - 5} more`);
  }

  if (dryRun) {
    console.log("\nDry run complete. Re-run with --confirm to apply.");
    return;
  }

  if (uniquePaths.length > 0) {
    const { error: storageError } = await adminClient.storage.from(W9_BUCKET).remove(uniquePaths);
    if (storageError) throw storageError;
    console.log(`Deleted ${uniquePaths.length} W-9 PDF(s) from ${W9_BUCKET}.`);
  }

  if (rows.length > 0) {
    const userIds = rows.map((row) => row.user_id);
    const { error: deleteError } = await adminClient.from("portal_w9_forms").delete().in("user_id", userIds);
    if (deleteError) throw deleteError;
    console.log(`Deleted ${rows.length} row(s) from portal_w9_forms.`);
  }

  let clearedTodos = 0;
  for (const user of usersWithTodo) {
    const completed = {
      ...(user.user_metadata?.completed_portal_todos && typeof user.user_metadata.completed_portal_todos === "object"
        ? user.user_metadata.completed_portal_todos
        : {}),
    };
    delete completed[W9_TODO_SLUG];

    const { error: updateError } = await adminClient.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        completed_portal_todos: completed,
      },
    });

    if (updateError) throw updateError;
    clearedTodos += 1;
  }

  console.log(`Cleared ${W9_TODO_SLUG} todo for ${clearedTodos} user(s).`);
  console.log("W-9 reset complete. Agents will need to submit a new W-9.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
