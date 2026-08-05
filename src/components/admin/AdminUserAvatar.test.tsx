import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminUserAvatar } from "@/components/admin/AdminUserAvatar";

describe("AdminUserAvatar", () => {
  it("uses the first and last initials from a full name", () => {
    const { container } = render(<AdminUserAvatar name="Avery Stone" />);

    expect(container).toHaveTextContent("AS");
  });

  it("uses the final surname when the name includes middle names", () => {
    const { container } = render(<AdminUserAvatar name="Avery Jordan Stone" />);

    expect(container).toHaveTextContent("AS");
  });
});
