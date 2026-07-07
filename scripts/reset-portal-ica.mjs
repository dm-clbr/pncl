#!/usr/bin/env node
/**
 * One-time reset: delete all signed ICA contracts (onboarding + portal) so
 * agents re-sign with the updated template (company counter-signature baked
 * in, contractor signature on the execution "BY" line).
 *
 * Before deleting, every stored PDF is downloaded to backups/ica-reset-<date>/.
 * Affected portal users get `ica_resign_required: true` in their metadata,
 * which shows a re-sign banner on the portal dashboard until they sign again
 * (submit-portal-ica clears the flag).
 *
 * Skips unlinked onboarding contract signatures newer than 48h — those may
 * belong to someone mid-onboarding whose submission still references them.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/reset-portal-ica.mjs --dry-run
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/reset-portal-ica.mjs --confirm
 *
 * Reads VITE_SUPABASE_URL from .env.local when present.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const ICA_TODO_SLUG = "ica_setup";
const PORTAL_ICA_BUCKET = "portal-profile-documents";
const ONBOARDING_CONTRACT_BUCKET = "onboarding-documents";
const IN_FLIGHT_ONBOARDING_TTL_MS = 48 * 60 * 60 * 1000;

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

  const { data: portalRows, error: portalError } = await adminClient
    .from("portal_ica_signatures")
    .select("user_id, pdf_path, legal_name, signed_at");
  if (portalError) throw portalError;

  const { data: onboardingRows, error: onboardingError } = await adminClient
    .from("onboarding_contract_signatures")
    .select("id, onboarding_id, legal_name, personal_email, signed_at, pdf_path");
  if (onboardingError) throw onboardingError;

  const portal = portalRows ?? [];
  const allOnboarding = onboardingRows ?? [];

  const now = Date.now();
  const inFlight = allOnboarding.filter(
    (row) =>
      !row.onboarding_id &&
      now - new Date(row.signed_at).getTime() < IN_FLIGHT_ONBOARDING_TTL_MS,
  );
  const onboarding = allOnboarding.filter((row) => !inFlight.includes(row));

  const portalPaths = [
    ...new Set(portal.map((row) => row.pdf_path?.trim() || `${row.user_id}/ica-signed.pdf`)),
  ];
  const onboardingPaths = [
    ...new Set(onboarding.map((row) => row.pdf_path?.trim()).filter(Boolean)),
  ];

  const users = await listAllUsers(adminClient);
  const usersWithTodo = users.filter((user) => {
    const completed = user.user_metadata?.completed_portal_todos;
    return completed && typeof completed === "object" && !Array.isArray(completed)
      && completed[ICA_TODO_SLUG] === true;
  });

  // Users who must see the re-sign banner: anyone with a deleted signature
  // row or a completed ICA todo.
  const signedUserIds = new Set(portal.map((row) => row.user_id));
  const emailToUserId = new Map(
    users.filter((u) => u.email).map((u) => [u.email.toLowerCase(), u.id]),
  );
  for (const row of onboarding) {
    const userId = emailToUserId.get(row.personal_email?.toLowerCase() ?? "");
    if (userId) signedUserIds.add(userId);
  }
  for (const user of usersWithTodo) signedUserIds.add(user.id);
  const usersToFlag = users.filter((user) => signedUserIds.has(user.id));

  console.log(`${dryRun ? "[DRY RUN] " : ""}ICA re-sign reset plan:`);
  console.log(`  portal_ica_signatures rows to delete: ${portal.length}`);
  console.log(`  onboarding_contract_signatures rows to delete: ${onboarding.length}`);
  console.log(`  Possibly in-flight onboarding signatures skipped (<48h, unlinked): ${inFlight.length}`);
  console.log(`  Portal ICA PDFs to back up + delete from ${PORTAL_ICA_BUCKET}: ${portalPaths.length}`);
  console.log(`  Onboarding ICA PDFs to back up + delete from ${ONBOARDING_CONTRACT_BUCKET}: ${onboardingPaths.length}`);
  console.log(`  Users with ${ICA_TODO_SLUG} todo to clear: ${usersWithTodo.length}`);
  console.log(`  Users to flag with ica_resign_required: ${usersToFlag.length}`);

  const samples = [
    ...portal.map((row) => `portal  ${row.legal_name} (${row.user_id}) signed ${row.signed_at}`),
    ...onboarding.map((row) => `onboard ${row.legal_name} <${row.personal_email}> signed ${row.signed_at}`),
  ];
  if (samples.length > 0) {
    console.log("\nSample signatures:");
    for (const line of samples.slice(0, 8)) console.log(`  - ${line}`);
    if (samples.length > 8) console.log(`  ... and ${samples.length - 8} more`);
  }

  if (dryRun) {
    console.log("\nDry run complete. Re-run with --confirm to apply.");
    return;
  }

  const backupDir = path.join(
    root,
    "backups",
    `ica-reset-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`,
  );
  const backupPlan = [
    ...portalPaths.map((p) => ({ bucket: PORTAL_ICA_BUCKET, path: p })),
    ...onboardingPaths.map((p) => ({ bucket: ONBOARDING_CONTRACT_BUCKET, path: p })),
  ];

  if (backupPlan.length > 0) {
    fs.mkdirSync(backupDir, { recursive: true });
    for (const item of backupPlan) {
      const { data, error } = await adminClient.storage.from(item.bucket).download(item.path);
      if (error) throw new Error(`Backup failed for ${item.bucket}/${item.path}: ${error.message}`);
      const target = path.join(backupDir, item.bucket, item.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, Buffer.from(await data.arrayBuffer()));
    }
    console.log(`Backed up ${backupPlan.length} PDF(s) to ${backupDir}.`);
  }

  if (portalPaths.length > 0) {
    const { error } = await adminClient.storage.from(PORTAL_ICA_BUCKET).remove(portalPaths);
    if (error) throw error;
    console.log(`Deleted ${portalPaths.length} PDF(s) from ${PORTAL_ICA_BUCKET}.`);
  }

  if (onboardingPaths.length > 0) {
    const { error } = await adminClient.storage
      .from(ONBOARDING_CONTRACT_BUCKET)
      .remove(onboardingPaths);
    if (error) throw error;
    console.log(`Deleted ${onboardingPaths.length} PDF(s) from ${ONBOARDING_CONTRACT_BUCKET}.`);
  }

  if (portal.length > 0) {
    const { error } = await adminClient
      .from("portal_ica_signatures")
      .delete()
      .in("user_id", portal.map((row) => row.user_id));
    if (error) throw error;
    console.log(`Deleted ${portal.length} row(s) from portal_ica_signatures.`);
  }

  if (onboarding.length > 0) {
    const { error } = await adminClient
      .from("onboarding_contract_signatures")
      .delete()
      .in("id", onboarding.map((row) => row.id));
    if (error) throw error;
    console.log(`Deleted ${onboarding.length} row(s) from onboarding_contract_signatures.`);
  }

  let updatedUsers = 0;
  for (const user of usersToFlag) {
    const completed = {
      ...(user.user_metadata?.completed_portal_todos && typeof user.user_metadata.completed_portal_todos === "object"
        ? user.user_metadata.completed_portal_todos
        : {}),
    };
    delete completed[ICA_TODO_SLUG];

    const { error } = await adminClient.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        completed_portal_todos: completed,
        ica_resign_required: true,
      },
    });
    if (error) throw error;
    updatedUsers += 1;
  }

  console.log(`Cleared ${ICA_TODO_SLUG} todo and set ica_resign_required for ${updatedUsers} user(s).`);
  console.log("ICA reset complete. Agents will see the re-sign notice in the portal.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
