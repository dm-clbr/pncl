import type { AdminPortalTodoSummary } from "./admin-api";
import { getSupabaseConfig } from "./supabase";
import { FALLBACK_PORTAL_TODOS } from "./portal-todos";
import {
  defaultFlowRules,
  inferContentType,
  validateFlowRules,
  type FlowRules,
  type FlowMediaMap,
  type FlowMedia,
  type StepContentType,
} from "../../supabase/functions/_shared/onboardingEditorRules";
export {
  APPLICATION_FIELDS,
  defaultFlowRules,
  validateVideoLink,
  validateStepLink,
  validateFlowRules,
  siblingSlugs,
} from "../../supabase/functions/_shared/onboardingEditorRules";
export type { FlowRules, FlowMedia, FlowMediaMap, StepContentType };
export interface EditorRow extends AdminPortalTodoSummary {
  contentType: StepContentType;
  flowContent: FlowMediaMap;
}
export interface EditorData {
  rows: EditorRow[];
  flows: Record<"loa" | "ibo", { rules: FlowRules; revision: number }>;
  limits: { video: number; document: number };
}
export const STAGES = [
  { id: "on_board", label: "On-Board" },
  { id: "pre_license", label: "Pre-License" },
  { id: "licensing", label: "Licensing" },
  { id: "new_producer", label: "New Producer" },
  { id: "sales_ready", label: "Sales Ready" },
] as const;
export const CONTENT_LABELS: Record<StepContentType, string> = {
  system: "System step",
  ica: "Agreement (PDF)",
  welcome_video: "Welcome video",
  surelc_video: "SureLC video",
  document: "Document",
  video: "Video",
  link: "Link",
};
export const isLocalEditor = () =>
  import.meta.env.DEV &&
  new URLSearchParams(location.search).get("localPreview") === "1";
export const editorUrl = (path: string) =>
  path + (isLocalEditor() ? "?localPreview=1" : "");
function endpoint() {
  const { url, anonKey } = getSupabaseConfig();
  return {
    url: `${url.replace(/\/$/, "")}/functions/v1/admin-onboarding-editor`,
    anonKey,
  };
}
async function request(token: string, body?: unknown) {
  const { url, anonKey } = endpoint();
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.message || "Unable to load the onboarding editor.");
  return data;
}
export function blankEditorRow(): EditorRow {
  return {
    id: "",
    slug: "",
    title: "",
    description: "",
    href: "",
    external: false,
    actionLabel: "Open",
    showEmailHint: false,
    showLoa: true,
    showIbo: true,
    sortOrder: 999,
    published: false,
    phase: "on_board",
    completionType: "agent",
    autoKey: null,
    gated: false,
    completedCount: 0,
    totalUsers: 0,
    completionPercent: 0,
    createdAt: "",
    updatedAt: "",
    contentType: "document",
    flowContent: {},
  };
}
const sampleRows = (): EditorRow[] => {
  const extras = [
    {
      id: "onboarding_welcome_loa",
      title: "Welcome & training video",
      description: "An introduction to getting started at PNCL.",
      phase: "on_board",
      href: "",
      completionType: "agent",
    },
    {
      id: "profile_setup",
      title: "Complete your profile",
      description: "Provide your legal name and basic information.",
      phase: "on_board",
      href: "/portal/profile",
      completionType: "auto",
    },
    {
      id: "drivers_license",
      title: "Upload your driver’s license",
      description: "Upload a clear and legible image of your license.",
      phase: "on_board",
      href: "/portal/profile",
      completionType: "auto",
    },
    {
      id: "surelc_tutorial",
      title: "SureLC walkthrough",
      description: "Watch your flow’s tutorial before carrier setup.",
      phase: "licensing",
      href: "",
      completionType: "agent",
    },
  ];
  return [...FALLBACK_PORTAL_TODOS, ...extras].map((todo, index) => ({
    ...blankEditorRow(),
    ...todo,
    id: crypto.randomUUID(),
    slug: todo.id,
    contentType: inferContentType(todo.id),
    phase: todo.phase as EditorRow["phase"],
    completionType: todo.completionType as EditorRow["completionType"],
    published: !todo.id.includes("welcome") && todo.id !== "surelc_tutorial",
    showIbo: !["w9_setup", "direct_deposit_setup"].includes(todo.id),
    sortOrder: index,
    updatedAt: new Date().toISOString(),
  }));
};
function previewDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("pncl-onboarding-editor-preview", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("data");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function localGet<T>(key: string): Promise<T | undefined> {
  const db = await previewDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("data");
    const req = tx.objectStore("data").get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}
async function localPut(key: string, value: unknown) {
  const db = await previewDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("data", "readwrite");
    tx.objectStore("data").put(value, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
const previewUrls = new Map<string, string>();
export async function fetchEditor(token: string): Promise<EditorData> {
  if (!isLocalEditor()) return request(token);
  let data = await localGet<EditorData>("editor");
  if (!data) {
    data = {
      rows: sampleRows(),
      flows: {
        loa: { rules: defaultFlowRules(), revision: 0 },
        ibo: { rules: defaultFlowRules(), revision: 0 },
      },
      limits: { video: 50 * 1024 * 1024, document: 20 * 1024 * 1024 },
    };
    await localPut("editor", data);
  }
  for (const row of data.rows)
    for (const media of Object.values(row.flowContent))
      if (media?.assetId) {
        const blob = await localGet<Blob>(media.assetId);
        if (blob) {
          if (!previewUrls.has(media.assetId))
            previewUrls.set(media.assetId, URL.createObjectURL(blob));
          media.url = previewUrls.get(media.assetId)!;
        }
      }
  return data;
}
export async function saveEditorStep(token: string, row: EditorRow) {
  if (!isLocalEditor()) return request(token, { action: "saveStep", row });
  const data = await fetchEditor(token);
  const previous = data.rows.find((item) => item.id === row.id);
  if (previous && previous.updatedAt !== row.updatedAt)
    throw new Error("This step changed. Reload before saving.");
  const saved = {
    ...row,
    id: row.id || crypto.randomUUID(),
    slug: row.slug || `custom_${crypto.randomUUID().replace(/-/g, "")}`,
    updatedAt: new Date().toISOString(),
  };
  data.rows = previous
    ? data.rows.map((item) => (item.id === row.id ? saved : item))
    : [...data.rows, saved];
  await localPut("editor", data);
  return { id: saved.id };
}
export async function saveEditorFlow(
  token: string,
  designation: "loa" | "ibo",
  rules: FlowRules,
  revision: number,
) {
  if (!isLocalEditor())
    return request(token, { action: "saveFlow", designation, rules, revision });
  const data = await fetchEditor(token);
  validateFlowRules(
    rules,
    data.rows.filter((row) =>
      designation === "loa" ? row.showLoa : row.showIbo,
    ),
  );
  if (data.flows[designation].revision !== revision)
    throw new Error("This flow changed. Reload before saving.");
  data.flows[designation] = { rules, revision: revision + 1 };
  await localPut("editor", data);
  return { revision: revision + 1 };
}
export async function stageEditorFile(
  token: string,
  designation: "loa" | "ibo",
  kind: StepContentType,
  file: File,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<FlowMedia> {
  if (isLocalEditor()) {
    if (signal.aborted) throw new DOMException("Canceled", "AbortError");
    const assetId = crypto.randomUUID();
    await localPut(assetId, file);
    const url = URL.createObjectURL(file);
    previewUrls.set(assetId, url);
    onProgress(100);
    return { mode: "file", assetId, url, filename: file.name, size: file.size };
  }
  return new Promise((resolve, reject) => {
    const { url, anonKey } = endpoint();
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);
    form.append("designation", designation);
    form.append("kind", kind);
    const abort = () => xhr.abort();
    signal.addEventListener("abort", abort, { once: true });
    const clean = () => signal.removeEventListener("abort", abort);
    xhr.open("POST", url);
    xhr.timeout = 300000;
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", anonKey);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      clean();
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status < 200 || xhr.status >= 300)
          throw new Error(data.message || "Upload failed.");
        resolve(data.media);
      } catch (error) {
        reject(error);
      }
    };
    xhr.onerror = () => {
      clean();
      reject(new Error("Upload interrupted. Retry the file."));
    };
    xhr.ontimeout = () => {
      clean();
      reject(new Error("Upload timed out. Retry or use a video link."));
    };
    xhr.onabort = () => {
      clean();
      reject(new DOMException("Canceled", "AbortError"));
    };
    if (signal.aborted) {
      clean();
      reject(new DOMException("Canceled", "AbortError"));
      return;
    }
    xhr.send(form);
  });
}
