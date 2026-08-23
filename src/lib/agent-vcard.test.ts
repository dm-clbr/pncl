import {
  buildAgentVCard,
  canCreateAgentVCard,
  getAgentVCardFileName,
} from "@/lib/agent-vcard";

describe("agent vCard", () => {
  it("creates a standards-compatible contact using the safe profile fields", () => {
    const card = buildAgentVCard({
      firstName: "Avery",
      lastName: "Rivera",
      organization: "PNCL",
      workEmail: "avery.rivera@thepncl.com",
    });

    expect(card).toBe([
      "BEGIN:VCARD",
      "VERSION:3.0",
      "PRODID:-//PNCL//Agent Digital Business Card//EN",
      "N;CHARSET=UTF-8:Rivera;Avery;;;",
      "FN;CHARSET=UTF-8:Avery Rivera",
      "ORG;CHARSET=UTF-8:PNCL",
      "EMAIL;TYPE=INTERNET,WORK:avery.rivera@thepncl.com",
      "END:VCARD",
      "",
    ].join("\r\n"));
    expect(card).not.toContain("ADR");
    expect(card).not.toContain("TEL");
    expect(card).not.toContain("NPN");
  });

  it("escapes text, supports appropriate optional contact fields, and folds long lines", () => {
    const card = buildAgentVCard({
      firstName: "Ana, María",
      lastName: "D'Example",
      organization: "PNCL; West",
      title: "Senior Agent",
      workEmail: "ana@thepncl.com\r\nX-INVALID:yes",
      workPhone: "+1 555 010 2222",
      workAddress: {
        street: "123 Business Ave, Suite 100",
        city: "A Very Long Municipality Name That Makes This Contact Line Need Folding",
        region: "CA",
        postalCode: "90210",
        country: "USA",
      },
      profileUrl: "https://www.thepncl.com/agents/ana\r\nX-INVALID:yes",
    });

    expect(card).toContain("FN;CHARSET=UTF-8:Ana\\, María D'Example");
    expect(card).toContain("ORG;CHARSET=UTF-8:PNCL\\; West");
    expect(card).toContain("TITLE;CHARSET=UTF-8:Senior Agent");
    expect(card).toContain("EMAIL;TYPE=INTERNET,WORK:ana@thepncl.comX-INVALID:yes");
    expect(card).toContain("TEL;TYPE=WORK,VOICE:+1 555 010 2222");
    expect(card).toContain("\r\n ");
    expect(card).not.toContain("\r\nX-INVALID");
    expect(card.split("\r\n").every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
    expect(card.endsWith("END:VCARD\r\n")).toBe(true);
  });

  it("handles missing optional data and makes a safe file name", () => {
    const minimalCard = buildAgentVCard({ workEmail: "agent@thepncl.com" });

    expect(minimalCard).toContain("FN;CHARSET=UTF-8:agent@thepncl.com");
    expect(minimalCard).toContain("EMAIL;TYPE=INTERNET,WORK:agent@thepncl.com");
    expect(canCreateAgentVCard({ workEmail: "agent@thepncl.com" })).toBe(true);
    expect(canCreateAgentVCard({})).toBe(false);
    expect(getAgentVCardFileName({ firstName: "Ana", lastName: "María" })).toBe("ana-maria-pncl.vcf");
    expect(buildAgentVCard({ firstName: "Avery" })).toContain("N;CHARSET=UTF-8:;Avery;;;");
  });
});
