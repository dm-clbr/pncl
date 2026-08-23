import { PDFDocument } from "pdf-lib";
import {
  BUSINESS_CARD_HEIGHT_POINTS,
  BUSINESS_CARD_WIDTH_POINTS,
  buildAgentBusinessCardPdf,
  canGenerateAgentBusinessCard,
  getAgentBusinessCardContent,
  getAgentBusinessCardFileName,
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

  it("requires a verified PNCL email and valid phone", () => {
    expect(canGenerateAgentBusinessCard(COMPLETE_CARD)).toBe(true);
    expect(canGenerateAgentBusinessCard({ ...COMPLETE_CARD, workEmailVerified: false })).toBe(false);
    expect(canGenerateAgentBusinessCard({ ...COMPLETE_CARD, workEmail: "avery@example.com" })).toBe(false);
    expect(canGenerateAgentBusinessCard({ ...COMPLETE_CARD, phoneNumber: "555-0100" })).toBe(false);
    expect(() => getAgentBusinessCardContent({ ...COMPLETE_CARD, phoneNumber: "" })).toThrow(/phone number is required/i);
  });
});
