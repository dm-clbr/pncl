import { getRecoveryEmailDashboardNotice } from "@/lib/portal-profile";

describe("recovery email dashboard notices", () => {
  it("waits for the profile before showing a notice", () => {
    expect(getRecoveryEmailDashboardNotice(null, true)).toBeNull();
  });

  it("requires agents without a personal recovery email to add one", () => {
    expect(getRecoveryEmailDashboardNotice(null, false)).toBe("missing");
    expect(getRecoveryEmailDashboardNotice({
      recovery_email: "   ",
      recovery_email_sync_status: null,
    }, false)).toBe("missing");
  });

  it("shows pending and failed Google synchronization states", () => {
    expect(getRecoveryEmailDashboardNotice({
      recovery_email: "agent@example.com",
      recovery_email_sync_status: "pending",
    }, false)).toBe("pending");
    expect(getRecoveryEmailDashboardNotice({
      recovery_email: "agent@example.com",
      recovery_email_sync_status: "error",
    }, false)).toBe("error");
  });

  it("treats an unconfirmed legacy sync status as pending", () => {
    expect(getRecoveryEmailDashboardNotice({
      recovery_email: "agent@example.com",
      recovery_email_sync_status: null,
    }, false)).toBe("pending");
  });

  it("stays quiet after Google confirms the recovery email", () => {
    expect(getRecoveryEmailDashboardNotice({
      recovery_email: "agent@example.com",
      recovery_email_sync_status: "synced",
    }, false)).toBeNull();
  });
});
