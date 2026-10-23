import { describe, it, expect } from "vitest";
import {
  defaultFlowRules,
  validateFlowRules,
  validateVideoLink,
  validateStepLink,
  applicationFieldVisible,
  canonicalStepSlug,
} from "../../supabase/functions/_shared/onboardingEditorRules";
import { compressionPlan } from "@/lib/video-compression";
import { isTodoGateLocked, type PortalTodo } from "@/lib/portal-todos";
const rows = [
  { slug: "ica", phase: "on_board" },
  { slug: "profile", phase: "on_board" },
  { slug: "license", phase: "licensing" },
];
describe("Flow rule validation", () => {
  it("preserves required application steps", () => {
    const rules = defaultFlowRules();
    rules.applicationOrder.pop();
    expect(() => validateFlowRules(rules, rows)).toThrow("every required step");
  });
  it("accepts independent order and rejects missing, future or circular prerequisites", () => {
    const rules = {
      ...defaultFlowRules(),
      portalOrder: ["profile", "ica", "license"],
      prerequisites: { ica: ["profile"] },
    };
    expect(validateFlowRules(rules, rows)).toEqual(rules);
    expect(() =>
      validateFlowRules(
        { ...rules, prerequisites: { ica: ["license"] } },
        rows,
      ),
    ).toThrow("later stage");
    expect(() =>
      validateFlowRules(
        { ...rules, prerequisites: { profile: ["ica"], ica: ["profile"] } },
        rows,
      ),
    ).toThrow();
    expect(() =>
      validateFlowRules(
        { ...rules, prerequisites: { ica: ["unknown"] } },
        rows,
      ),
    ).toThrow("valid prerequisites");
  });
  it("shows optional fields only for the matching answer and requires the question first", () => {
    const rules = defaultFlowRules();
    rules.conditions = [
      { id: "test", field: "hasLicense", equals: "Yes", target: "npn" },
    ];
    expect(validateFlowRules(rules, rows)).toEqual(rules);
    expect(applicationFieldVisible("npn", { hasLicense: "No" }, rules)).toBe(
      false,
    );
    expect(applicationFieldVisible("npn", { hasLicense: "Yes" }, rules)).toBe(
      true,
    );
    rules.conditions[0].target = "profilePhoto";
    expect(() => validateFlowRules(rules, rows)).toThrow("question before");
  });
  it("maps paired IBO steps to their canonical editor identities", () => {
    expect(canonicalStepSlug("surelc_tutorial_ibo")).toBe("surelc_tutorial");
    expect(canonicalStepSlug("onboarding_welcome_ibo")).toBe(
      "onboarding_welcome_loa",
    );
  });
  it("locks a configured prerequisite but preserves completed history", () => {
    const todos = [
      { id: "a", phase: "on_board", completed: false },
      { id: "b", phase: "on_board", prerequisites: ["a"] },
    ] as PortalTodo[];
    expect(isTodoGateLocked(todos, "b")).toBe(true);
    todos[0].completed = true;
    expect(isTodoGateLocked(todos, "b")).toBe(false);
    todos[0].completed = false;
    todos[1].completed = true;
    expect(isTodoGateLocked(todos, "b")).toBe(false);
  });
});
describe("Video and document preparation rules", () => {
  it("budgets a ten-minute video below the 50 MiB cap including audio and overhead", () => {
    const plan = compressionPlan(600, 50 * 1024 * 1024);
    expect(plan.target).toBe(45 * 1024 * 1024);
    expect(((plan.videoBitrate + plan.audioBitrate) * 600) / 8).toBeLessThan(
      plan.target,
    );
    expect(plan.height).toBe(480);
    expect(compressionPlan(600, 20 * 1024 * 1024).target).toBe(
      18 * 1024 * 1024,
    );
  });
  it("rejects unreadable duration and unreasonably low quality budgets", () => {
    expect(() => compressionPlan(Infinity, 52428800)).toThrow();
    expect(() => compressionPlan(20000, 52428800)).toThrow("hosted video");
  });
  it("accepts playable supported URLs and rejects dangerous or unsupported sources", () => {
    expect(
      validateVideoLink("https://iframe.mediadelivery.net/embed/123/abc-123"),
    ).toContain("/embed/123/");
    expect(
      validateVideoLink("https://example.com/video.mp4?token=sample"),
    ).toContain("video.mp4");
    for (const url of [
      "javascript:alert(1)",
      "https://example.com/watch",
      "http://example.com/video.mp4",
      "https://user:pass@example.com/a.mp4",
      "https://iframe.mediadelivery.net.evil.com/embed/1/abc",
    ])
      expect(() => validateVideoLink(url)).toThrow();
    expect(() => validateStepLink("//evil.test")).toThrow();
    expect(validateStepLink("/portal/profile")).toBe("/portal/profile");
  });
});
