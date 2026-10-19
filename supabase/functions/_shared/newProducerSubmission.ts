import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { filterAgentTodos } from "./agentDesignation.ts";
import { loadAgentDesignations } from "./portalAgentDesignations.ts";
import { userHasCompAttachment } from "./portalCompAttachments.ts";
import { computeAutoCompletionSets, getCompletedTodosFromMetadata, isTodoCompleteForUser, type PortalTodoRecord } from "./portalTodos.ts";

export async function submitNewProducer(adminClient: SupabaseClient, user: User): Promise<string> {
  const { data: existing, error: existingError } = await adminClient.from("portal_tickets")
    .select("id").eq("user_id", user.id).eq("type", "new_producer").maybeSingle();
  if (existingError) throw new Error(existingError.message);
  // An already accepted request remains accepted if the checklist later changes.
  if (existing) return existing.id;

  const { data, error } = await adminClient.from("portal_todos").select("*")
    .eq("published", true).order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const designations = await loadAgentDesignations(adminClient, [user.id]);
  const designation = designations.get(user.id) ?? "loa";
  let rows = filterAgentTodos((data ?? []) as PortalTodoRecord[], designation);
  if (rows.some((row) => row.slug === "comp_agreement") && !await userHasCompAttachment(adminClient, user.id)) {
    rows = rows.filter((row) => row.slug !== "comp_agreement");
  }
  const submission = rows.find((row) => row.slug === "submit_new_producer");
  if (!submission) throw new Error("New Producer submission is unavailable. Contact PNCL support.");
  const prerequisites = rows.filter((row) => row.phase === "on_board" || row.phase === "pre_license"
    || (row.phase === "licensing" && row.sort_order < submission.sort_order));
  const autoKeys = new Set(prerequisites.filter((row) => row.completion_type === "auto" && row.auto_key).map((row) => row.auto_key!));
  const autoSets = await computeAutoCompletionSets(adminClient, autoKeys, [user.id]);
  const completed = getCompletedTodosFromMetadata(user.user_metadata);
  const incomplete = prerequisites.filter((row) => row.completion_type === "auto" && row.auto_key
    ? !autoSets.get(row.auto_key)?.has(user.id)
    : !isTodoCompleteForUser(row, user.id, completed, autoSets));
  if (incomplete.length) throw new Error(`Complete these steps before submitting: ${incomplete.map((row) => row.title).join(", ")}.`);

  const { data: profile, error: profileError } = await adminClient.from("portal_profiles")
    .select("first_name, last_name, npn").eq("user_id", user.id).maybeSingle();
  if (profileError) throw new Error(profileError.message);
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || user.email || "Agent";
  const description = `${name} has completed the onboarding prerequisites and submitted for New Producer.\nDesignation: ${designation.toUpperCase()}\nPNCL email: ${user.email ?? ""}\nNPN: ${profile?.npn ?? ""}\n\nBuild this agent's profile in PLG's back-end system and follow up on their carrier applications.`;
  const { data: ticketId, error: submitError } = await adminClient.rpc("submit_portal_new_producer", {
    p_user_id: user.id, p_description: description,
  });
  if (submitError) throw new Error(submitError.message);
  if (typeof ticketId !== "string") throw new Error("Unable to create New Producer ticket.");
  return ticketId;
}
