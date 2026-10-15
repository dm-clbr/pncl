import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import PortalAuthLayout from "@/components/portal/PortalAuthLayout";

const gradientProps: Array<Record<string, unknown>> = [];

// WebGL2 has no jsdom implementation; record the budget the layout hands it.
vi.mock("@/components/ui/liquid-gradient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui/liquid-gradient")>()),
  default: (props: Record<string, unknown>) => {
    gradientProps.push(props);
    return null;
  },
}));

function setPointer(coarse: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({
      matches: query === "(pointer: coarse)" ? coarse : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }),
  );
}

afterEach(() => {
  gradientProps.length = 0;
  vi.unstubAllGlobals();
});

function renderLayout() {
  render(
    <MemoryRouter>
      <PortalAuthLayout>
        <p>content</p>
      </PortalAuthLayout>
    </MemoryRouter>,
  );
  return gradientProps.at(-1)!;
}

describe("PortalAuthLayout gradient budget", () => {
  it("caps the backdrop at 20fps and 0.5 dpr on a coarse pointer", () => {
    setPointer(true);
    const props = renderLayout();

    expect(props.fps).toBe(20);
    expect(props.maxDpr).toBe(0.5);
    expect(props.fallbackColor).toBe("transparent");
  });

  it("uses the desktop budget on a fine pointer", () => {
    setPointer(false);
    const props = renderLayout();

    expect(props.fps).toBe(30);
    expect(props.maxDpr).toBe(1);
  });
});
