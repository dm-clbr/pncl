import { describe, expect, it } from "vitest";
import { buildAdminAssistHierarchyResponse } from "../../supabase/functions/_shared/adminAssistHierarchyResponse";

describe("admin-assist hierarchy response", () => {
  it("allowlists hierarchy and NPN fields while stripping emails and sensitive admin data", () => {
    const response = buildAdminAssistHierarchyResponse({
      tree: [{
        id: "raychel",
        name: "Raychel Weidler",
        email: "raychel@thepncl.com",
        npn: "12345678",
        referrerName: "Upline Agent",
        referrerEmail: "upline@thepncl.com",
        referrerNpn: "87654321",
        compLevel: 110,
        phoneNumber: "555-0100",
        credentials: { username: "private-user", password: "private-password" },
        documents: ["private-document.pdf"],
        bankAccount: "private-bank-account",
        children: [{
          id: "direct-report",
          name: "Direct Report",
          email: "direct@thepncl.com",
          npn: null,
          referrerName: "Raychel Weidler",
          referrerEmail: "raychel@thepncl.com",
          referrerNpn: "12345678",
          children: [],
        }],
      }],
      focusOptions: [{
        id: "raychel",
        name: "Raychel Weidler",
        email: "raychel@thepncl.com",
        npn: "12345678",
      }],
      totalAgents: 2,
    });

    expect(response).toEqual({
      tree: [{
        id: "raychel",
        name: "Raychel Weidler",
        npn: "12345678",
        referrerName: "Upline Agent",
        referrerNpn: "87654321",
        children: [{
          id: "direct-report",
          name: "Direct Report",
          npn: null,
          referrerName: "Raychel Weidler",
          referrerNpn: "12345678",
          children: [],
        }],
      }],
      focusOptions: [{ id: "raychel", name: "Raychel Weidler", npn: "12345678" }],
      totalAgents: 2,
      readOnly: true,
    });

    const serialized = JSON.stringify(response);
    expect(serialized).not.toMatch(/@thepncl\.com|compLevel|phoneNumber|credentials|documents|bankAccount/);
  });
});
