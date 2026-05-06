const WEB3FORMS_URL = "https://api.web3forms.com/submit";
const WEB3FORMS_KEY = "YOUR_WEB3FORMS_KEY_HERE";

export async function submitLead(data: Record<string, string>) {
  const res = await fetch(WEB3FORMS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ access_key: WEB3FORMS_KEY, ...data }),
  });
  if (!res.ok) throw new Error("Submission failed");
  const json = await res.json();
  if (!json.success) throw new Error(json.message || "Submission failed");
  return json;
}
