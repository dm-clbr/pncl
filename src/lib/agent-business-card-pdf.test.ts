import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import {
  BUSINESS_CARD_HEIGHT_POINTS,
  BUSINESS_CARD_WIDTH_POINTS,
  buildAgentBusinessCardPdf,
  canShareAgentBusinessCardPdfFile,
  canGenerateAgentBusinessCard,
  createAgentBusinessCardPdfFile,
  downloadAgentBusinessCardPdfFile,
  getAgentBusinessCardContent,
  getAgentBusinessCardFileName,
  shareAgentBusinessCardPdfFile,
  type AgentBusinessCardData,
} from "@/lib/agent-business-card-pdf";

const COMPLETE_CARD: AgentBusinessCardData = {
  firstName: "Avery",
  lastName: "Rivera",
  workEmail: "Avery.Rivera@thepncl.com",
  workEmailVerified: true,
  phoneNumber: "(555) 555-0100",
};

describe("agent business card PDF", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("normalizes only the approved contact fields", () => {
    expect(getAgentBusinessCardContent(COMPLETE_CARD)).toEqual({
      name: "Avery Rivera",
      affiliation: "PNCL AGENT",
      workEmail: "avery.rivera@thepncl.com",
      phoneNumber: "555-555-0100",
    });
    expect(getAgentBusinessCardFileName(COMPLETE_CARD)).toBe("avery-rivera-pncl-business-card.pdf");
  });

  it("creates a one-page, print-size PDF", async () => {
    const bytes = await buildAgentBusinessCardPdf(COMPLETE_CARD);
    const pdf = await PDFDocument.load(bytes);
    const [page] = pdf.getPages();

    expect(bytes.slice(0, 5)).toEqual(new Uint8Array([37, 80, 68, 70, 45]));
    expect(pdf.getPageCount()).toBe(1);
    expect(page.getWidth()).toBe(BUSINESS_CARD_WIDTH_POINTS);
    expect(page.getHeight()).toBe(BUSINESS_CARD_HEIGHT_POINTS);
    expect(pdf.getTitle()).toBe("Avery Rivera - PNCL Business Card");
  });

  it("creates a named PDF File for browser download and sharing", async () => {
    const file = await createAgentBusinessCardPdfFile(COMPLETE_CARD);

    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("avery-rivera-pncl-business-card.pdf");
    expect(file.type).toBe("application/pdf");
    expect(file.size).toBeGreaterThan(100);
  });

  it("shares only the PDF file when the browser supports file sharing", async () => {
    const file = new File(["pdf"], "agent-card.pdf", { type: "application/pdf" });
    const canShare = vi.fn().mockReturnValue(true);
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { canShare, share });

    expect(canShareAgentBusinessCardPdfFile(file)).toBe(true);
    await shareAgentBusinessCardPdfFile(file);

    expect(canShare).toHaveBeenCalledWith({ files: [file] });
    expect(share).toHaveBeenCalledWith({ files: [file] });
    expect(Object.keys(share.mock.calls[0][0])).toEqual(["files"]);
  });

  it("reports file sharing as unsupported when canShare is unavailable or rejects the payload", () => {
    const file = new File(["pdf"], "agent-card.pdf", { type: "application/pdf" });
    vi.stubGlobal("navigator", { share: vi.fn() });
    expect(canShareAgentBusinessCardPdfFile(file)).toBe(false);

    vi.stubGlobal("navigator", {
      canShare: vi.fn(() => {
        throw new Error("Unsupported payload");
      }),
      share: vi.fn(),
    });
    expect(canShareAgentBusinessCardPdfFile(file)).toBe(false);
  });

  it("downloads through an attachment object URL and revokes it promptly", () => {
    vi.useFakeTimers();
    const file = new File(["pdf"], "agent-card.pdf", { type: "application/pdf" });
    const createObjectURL = vi.fn().mockReturnValue("blob:agent-card");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const clickedLinks: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clickedLinks.push(this);
    });

    downloadAgentBusinessCardPdfFile(file);

    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(clickedLinks).toHaveLength(1);
    expect(clickedLinks[0].download).toBe("agent-card.pdf");
    expect(clickedLinks[0].href).toBe("blob:agent-card");
    expect(clickedLinks[0].target).toBe("");
    expect(document.body.contains(clickedLinks[0])).toBe(false);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:agent-card");
  });

  it("embeds a normalized profile portrait and falls back when image bytes are unsafe", async () => {
    const pngBytes = new Uint8Array(readFileSync(resolve(process.cwd(), "public/pwa-192x192.png")));
    const portraitBytes = await buildAgentBusinessCardPdf({
      ...COMPLETE_CARD,
      profilePhoto: { pngBytes },
    });
    const portraitPdf = await PDFDocument.load(portraitBytes);
    const portraitResources = portraitPdf.getPages()[0].node.Resources();
    const portraitImages = portraitResources?.lookupMaybe(PDFName.of("XObject"), PDFDict);

    expect(portraitImages?.keys().length).toBeGreaterThan(0);

    const fallbackBytes = await buildAgentBusinessCardPdf({
      ...COMPLETE_CARD,
      profilePhoto: { pngBytes: new Uint8Array([1, 2, 3]) },
    });
    const fallbackPdf = await PDFDocument.load(fallbackBytes);
    const fallbackResources = fallbackPdf.getPages()[0].node.Resources();
    const fallbackImages = fallbackResources?.lookupMaybe(PDFName.of("XObject"), PDFDict);

    expect(fallbackPdf.getPageCount()).toBe(1);
    expect(fallbackImages?.keys().length ?? 0).toBe(0);
  });

  it("requires a verified PNCL email and valid phone", () => {
    expect(canGenerateAgentBusinessCard(COMPLETE_CARD)).toBe(true);
    expect(canGenerateAgentBusinessCard({ ...COMPLETE_CARD, workEmailVerified: false })).toBe(false);
    expect(canGenerateAgentBusinessCard({ ...COMPLETE_CARD, workEmail: "avery@example.com" })).toBe(false);
    expect(canGenerateAgentBusinessCard({ ...COMPLETE_CARD, phoneNumber: "555-0100" })).toBe(false);
    expect(() => getAgentBusinessCardContent({ ...COMPLETE_CARD, phoneNumber: "" })).toThrow(/phone number is required/i);
  });
});
