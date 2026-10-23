export const APPLICATION_FIELDS = [
  ["phoneNumber", "Phone number"],
  ["dateOfBirth", "Date of birth"],
  ["ssn", "Social Security Number"],
  ["stateOfResidence", "State of residence"],
  ["addressLine1", "Street address"],
  ["addressCity", "City"],
  ["addressZip", "ZIP code"],
  ["driversLicense", "Driver’s license"],
  ["profilePhoto", "Profile picture"],
  ["uplineNetwork", "Upline network"],
  ["hasLicense", "Insurance license"],
  ["npn", "NPN"],
  ["hasEoInsurance", "E&O insurance"],
  ["hasOtherImo", "Another IMO"],
] as const;
export type FlowCondition = {
  id: string;
  field: "hasLicense" | "hasEoInsurance" | "hasOtherImo";
  equals: "Yes" | "No";
  target: "npn" | "profilePhoto";
};
export interface FlowRules {
  applicationOrder: string[];
  portalOrder: string[];
  prerequisites: Record<string, string[]>;
  conditions: FlowCondition[];
}
export const defaultFlowRules = (): FlowRules => ({
  applicationOrder: APPLICATION_FIELDS.map(([key]) => key),
  portalOrder: [],
  prerequisites: {},
  conditions: [],
});
export const CONTENT_TYPES = [
  "system",
  "ica",
  "welcome_video",
  "surelc_video",
  "document",
  "video",
  "link",
] as const;
export type StepContentType = (typeof CONTENT_TYPES)[number];
export type FlowMedia = {
  mode: "file" | "link";
  assetId?: string;
  url: string;
  filename?: string;
  size?: number;
};
export type FlowMediaMap = { loa?: FlowMedia; ibo?: FlowMedia };
export const siblingSlugs: Record<string, string> = {
  onboarding_welcome_loa: "onboarding_welcome_ibo",
  surelc_tutorial: "surelc_tutorial_ibo",
};
export function canonicalStepSlug(slug: string) {
  return (
    Object.entries(siblingSlugs).find(([, sibling]) => sibling === slug)?.[0] ??
    slug
  );
}
export function inferContentType(slug: string): StepContentType {
  if (slug === "ica_setup") return "ica";
  if (slug.startsWith("onboarding_welcome_")) return "welcome_video";
  if (slug === "surelc_tutorial" || slug === "surelc_tutorial_ibo")
    return "surelc_video";
  return "system";
}
export function validateVideoLink(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid video URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.href.length > 2000
  )
    throw new Error("Use an HTTPS video URL without credentials.");
  const bunny =
    /^(player\.mediadelivery\.net|iframe\.mediadelivery\.net)$/.test(
      url.hostname,
    ) && /^\/(play|embed)\/\d+\/[\w-]+\/?$/.test(url.pathname);
  if (!bunny && !/\.(mp4|webm)$/i.test(url.pathname))
    throw new Error("Use a Bunny Stream link or a direct MP4/WebM URL.");
  return url.href;
}
export function validateStepLink(value: string): string {
  if (!value) return "";
  if (/^\/(?!\/)/.test(value) && !/[\\\r\n]/.test(value)) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter an HTTPS or portal link.");
  }
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Enter an HTTPS or portal link.");
  return url.href;
}
export function validateFlowRules(
  input: unknown,
  todos: { slug: string; phase: string }[],
): FlowRules {
  if (!input || typeof input !== "object")
    throw new Error("Invalid flow settings.");
  const data = input as FlowRules;
  const fields = APPLICATION_FIELDS.map(([key]) => key);
  if (
    !Array.isArray(data.applicationOrder) ||
    data.applicationOrder.length !== fields.length ||
    new Set(data.applicationOrder).size !== fields.length ||
    data.applicationOrder.some(
      (key) => !fields.includes(key as (typeof fields)[number]),
    )
  )
    throw new Error(
      "The application must contain every required step exactly once.",
    );
  const slugs = new Set(todos.map((t) => t.slug));
  if (
    !Array.isArray(data.portalOrder) ||
    new Set(data.portalOrder).size !== data.portalOrder.length ||
    data.portalOrder.some((key) => !slugs.has(key))
  )
    throw new Error("The checklist contains an unknown or duplicate step.");
  if (
    !data.prerequisites ||
    typeof data.prerequisites !== "object" ||
    Array.isArray(data.prerequisites)
  )
    throw new Error("Invalid prerequisites.");
  const phaseOrder = [
    "on_board",
    "pre_license",
    "licensing",
    "new_producer",
    "sales_ready",
  ];
  for (const [target, dependencies] of Object.entries(data.prerequisites)) {
    if (
      !slugs.has(target) ||
      !Array.isArray(dependencies) ||
      new Set(dependencies).size !== dependencies.length ||
      dependencies.some((id) => !slugs.has(id) || id === target)
    )
      throw new Error("Choose valid prerequisites for each step.");
    for (const id of dependencies) {
      const stage = (slug: string) =>
        phaseOrder.indexOf(todos.find((t) => t.slug === slug)!.phase);
      if (stage(id) > stage(target))
        throw new Error("A prerequisite cannot come from a later stage.");
      const order = [
        ...data.portalOrder,
        ...todos
          .map((t) => t.slug)
          .filter((slug) => !data.portalOrder.includes(slug)),
      ];
      if (
        stage(id) === stage(target) &&
        order.indexOf(id) >= order.indexOf(target)
      )
        throw new Error(
          "Place each prerequisite before the step that requires it.",
        );
    }
  }
  const visit = (id: string, ancestors: Set<string>) => {
    if (ancestors.has(id))
      throw new Error("Prerequisites cannot create a circular flow.");
    const next = new Set(ancestors).add(id);
    for (const dependency of data.prerequisites[id] ?? [])
      visit(dependency, next);
  };
  for (const id of slugs) visit(id, new Set());
  if (!Array.isArray(data.conditions) || data.conditions.length > 2)
    throw new Error(
      "Add at most one condition for each optional application field.",
    );
  const targets = new Set<string>();
  for (const condition of data.conditions) {
    if (
      !condition ||
      !["hasLicense", "hasEoInsurance", "hasOtherImo"].includes(
        condition.field,
      ) ||
      !["Yes", "No"].includes(condition.equals) ||
      !["npn", "profilePhoto"].includes(condition.target) ||
      targets.has(condition.target)
    )
      throw new Error("Choose a valid condition for each optional field.");
    if (
      data.applicationOrder.indexOf(condition.field) >=
      data.applicationOrder.indexOf(condition.target)
    )
      throw new Error(
        "Place the condition’s question before the field it controls.",
      );
    targets.add(condition.target);
  }
  return {
    applicationOrder: data.applicationOrder,
    portalOrder: data.portalOrder,
    prerequisites: data.prerequisites,
    conditions: data.conditions,
  };
}
export function applicationFieldVisible(
  key: string,
  values: {
    hasLicense?: string;
    hasEoInsurance?: string;
    hasOtherImo?: string;
  },
  rules: FlowRules,
): boolean {
  const condition = rules.conditions.find((item) => item.target === key);
  return !condition || values[condition.field] === condition.equals;
}
