import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PortalDashboardFilesList from "@/components/PortalDashboardFilesList";

describe("PortalDashboardFilesList", () => {
  it("renders one download link per file with its type chip", () => {
    render(
      <PortalDashboardFilesList
        items={[
          {
            id: "a",
            title: "Dialing 123 (9)",
            description: null,
            url: "https://files.test/a.pdf",
            fileName: "a.pdf",
            contentType: "application/pdf",
          },
          {
            id: "b",
            title: "Logo Pack",
            description: null,
            url: "https://files.test/b.zip",
            fileName: "b.zip",
            contentType: "application/zip",
          },
        ]}
      />,
    );

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "https://files.test/a.pdf");
    expect(links[0]).toHaveAttribute("download", "a.pdf");
    expect(links[0]).toHaveTextContent("Dialing 123 (9)");
    expect(links[0].querySelector(".ptile-chip")).toHaveTextContent("PDF");
    expect(links[1].querySelector(".ptile-chip")).toHaveTextContent("ZIP");
  });
});
