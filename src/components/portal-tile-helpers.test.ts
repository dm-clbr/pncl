import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isOutbound, useSlowLoading } from "@/components/portal-tile-helpers";

describe("isOutbound", () => {
  it("is true only for absolute http(s) hrefs on another origin", () => {
    expect(isOutbound("https://leadspply.com/register")).toBe(true);
    expect(isOutbound(`${window.location.origin}/portal/carriers`)).toBe(false);
    expect(isOutbound("/portal/clients")).toBe(false);
  });
});

describe("useSlowLoading", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("turns true after 10 s of loading and resets once loading ends", () => {
    const { result, rerender } = renderHook(({ loading }) => useSlowLoading(loading), {
      initialProps: { loading: true },
    });
    act(() => {
      vi.advanceTimersByTime(9_900);
    });
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe(true);
    rerender({ loading: false });
    expect(result.current).toBe(false);
  });
});
