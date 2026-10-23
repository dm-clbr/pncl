import { describe, expect, it, vi } from "vitest";
import { assertCurrentIcaTemplate, MAX_ICA_BYTES, MAX_VIDEO_BYTES, validateOnboardingAsset, validateOtherImoDetails } from "../../supabase/functions/_shared/onboardingContentRules";
import { downloadIcaAsset, loadOnboardingContent, resolveOnboardingDesignation } from "../../supabase/functions/_shared/onboardingContent";
import { resolveReferralInvitePublicInfo } from "../../supabase/functions/_shared/portalReferralInvites";
import { canCompleteTodo, completePortalTodo, filterPortalTodosForAgent, type PortalTodo } from "@/lib/portal-todos";

vi.mock("../../supabase/functions/_shared/portalReferralInvites.ts", () => ({ resolveReferralInvitePublicInfo: vi.fn() }));

describe("onboarding content validation", () => {
  it.each(["loa", "ibo"])("accepts separate PDF and video files for %s", (designation) => {
    expect(validateOnboardingAsset(designation, "ica", { type: "application/pdf", size: MAX_ICA_BYTES })).toMatchObject({ designation, extension: "pdf" });
    for (const kind of ["welcome_video", "surelc_video"]) expect(validateOnboardingAsset(designation, kind, { type: "video/webm", size: MAX_VIDEO_BYTES })).toMatchObject({ designation, kind, extension: "webm" });
  });
  it("rejects unsupported files, oversized uploads and invalid flow values", () => {
    expect(() => validateOnboardingAsset("admin", "ica", { type: "application/pdf", size: 10 })).toThrow("LOA or IBO");
    expect(() => validateOnboardingAsset("loa", "ica", { type: "text/html", size: 10 })).toThrow("PDFs");
    expect(() => validateOnboardingAsset("loa", "ica", { type: "application/pdf", size: MAX_ICA_BYTES + 1 })).toThrow("20 MB");
    expect(() => validateOnboardingAsset("ibo", "surelc_video", { type: "video/mp4", size: MAX_VIDEO_BYTES + 1 })).toThrow("50 MB");
    expect(() => validateOnboardingAsset("ibo", "welcome_video", { type: "video/mp4", size: 0 })).toThrow();
  });
  it("rejects signing a replaced template or a fabricated template ID", () => {
    expect(() => assertCurrentIcaTemplate("old-id", "new-id")).toThrow("agreement has changed");
    expect(() => assertCurrentIcaTemplate(undefined, "new-id")).toThrow();
    expect(() => assertCurrentIcaTemplate("fabricated", null)).toThrow();
    expect(() => assertCurrentIcaTemplate("id", "id")).not.toThrow();
    expect(() => assertCurrentIcaTemplate(undefined, null)).not.toThrow();
  });
  it("derives a recruit's flow from the stored invite and refuses invalid invites", async () => {
    vi.mocked(resolveReferralInvitePublicInfo).mockResolvedValue({ agentDesignation: "ibo" } as never);
    expect(await resolveOnboardingDesignation({} as never, "invite")).toBe("ibo");
    expect(await resolveOnboardingDesignation({} as never, undefined)).toBe("loa");
    vi.mocked(resolveReferralInvitePublicInfo).mockRejectedValue(new Error("expired"));
    await expect(resolveOnboardingDesignation({} as never, "bad-invite")).rejects.toThrow("expired");
  });
  it("fails closed on a missing configuration rather than using the wrong ICA", async () => {
    const q = { select: () => q, eq: () => q, single: async () => ({ data: null, error: { message: "unavailable" } }) };
    await expect(loadOnboardingContent({ from: () => q } as never, "ibo")).rejects.toThrow("unavailable");
  });
  it("rejects inaccessible source documents instead of signing a fallback", async () => {
    const client = { storage: { from: () => ({ download: async () => ({ data: null, error: new Error("missing") }) }) } };
    await expect(downloadIcaAsset(client as never, { path: "ibo/ica.pdf" } as never)).rejects.toThrow("selected ICA");
  });
});

describe("other IMO transfer details", () => {
  it("requires both fields for Yes and normalizes carrier lists", () => {
    expect(() => validateOtherImoDetails("Yes", "", "Foresters")).toThrow("IMO's name");
    expect(() => validateOtherImoDetails("Yes", "Other IMO", " , \n")).toThrow("carrier names");
    expect(validateOtherImoDetails("Yes", " Example IMO ", "Foresters, Mutual of Omaha\n foresters")).toEqual({ otherImoName: "Example IMO", otherImoCarriers: ["foresters", "Mutual of Omaha"] });
  });
  it("clears stale fields for No and rejects malformed or excessive data", () => {
    expect(validateOtherImoDetails("No", "Old IMO", "Old carrier")).toEqual({ otherImoName: null, otherImoCarriers: [] });
    expect(() => validateOtherImoDetails("Yes", "IMO", ["Carrier", 3])).toThrow();
    expect(() => validateOtherImoDetails("Yes", "a".repeat(201), "Carrier")).toThrow();
    expect(() => validateOtherImoDetails("Yes", "IMO", Array.from({ length: 51 }, (_, i) => `Carrier ${i}`))).toThrow();
  });
});

describe("welcome video completion", () => {
  const videos: PortalTodo[] = ["loa", "ibo"].map((designation) => ({ id: `onboarding_welcome_${designation}`, title: "Welcome", description: "Watch", href: "https://example.invalid/video.mp4", actionLabel: "Watch", external: true, completionType: "agent", phase: "on_board", showLoa: designation === "loa", showIbo: designation === "ibo" }));
  it.each(["loa", "ibo"])("shows only the %s welcome step and requires full playback", async (designation) => {
    const todos = filterPortalTodosForAgent(videos, designation);
    expect(todos).toHaveLength(1);
    expect(todos[0].id).toBe(`onboarding_welcome_${designation}`);
    await expect(completePortalTodo(todos[0].id, todos)).rejects.toThrow("full video");
    expect(canCompleteTodo([...todos, { ...todos[0], id: "next", phase: "pre_license" }], "next")).toBe(false);
  });
});
