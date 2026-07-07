import { getSupabaseClient } from "@/lib/supabase";

export type PayPolicyCategory = "policy" | "faq";

export interface PayPolicyEntry {
  id: string;
  title: string;
  body: string;
  category: PayPolicyCategory;
  sort_order: number;
  published: boolean;
  created_at: string;
  updated_at: string;
}

/** Published entries only — agents read straight from the table under RLS. */
export async function fetchPayPolicyEntries(): Promise<PayPolicyEntry[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("portal_pay_policy_entries")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as PayPolicyEntry[];
}
