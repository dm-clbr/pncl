import { useRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAdminModal } from "@/components/admin/useAdminModal";

function Harness() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useAdminModal(ref, open, () => setOpen(false));
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      {open && (
        <div ref={ref} role="dialog" aria-modal="true" tabIndex={-1}>
          <button type="button">First</button>
          <button type="button">Last</button>
        </div>
      )}
    </>
  );
}

describe("useAdminModal", () => {
  it("moves focus in, traps Tab, closes on Escape and restores focus and scroll", () => {
    document.body.style.overflow = "auto";
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open" });
    opener.focus();
    fireEvent.click(opener);

    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });
    expect(document.activeElement).toBe(first);
    expect(document.body.style.overflow).toBe("hidden");

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("auto");
    expect(document.activeElement).toBe(opener);
  });
});
