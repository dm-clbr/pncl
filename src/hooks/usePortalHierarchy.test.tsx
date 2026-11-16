import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePortalHierarchy } from './usePortalHierarchy';
import { getPortalHierarchy } from '@/lib/portal-hierarchy';
import { portalHierarchyFixture } from '@/test/fixtures/portal-hierarchy';
let token: string | undefined;
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ session: token ? {access_token:token} : null, loading:false }) }));
vi.mock('@/lib/portal-hierarchy', async (original) => ({ ...await original<typeof import('@/lib/portal-hierarchy')>(), getPortalHierarchy:vi.fn() }));
beforeEach(() => { token = 'first-account'; vi.mocked(getPortalHierarchy).mockReset(); });
describe('team hierarchy request lifecycle', () => {
  it('discards in-flight results after an account change and clears data on sign-out', async () => {
    let finishFirst!: (value: ReturnType<typeof portalHierarchyFixture>) => void;
    vi.mocked(getPortalHierarchy).mockImplementationOnce(() => new Promise(resolve => {finishFirst = resolve;}));
    const second = {...portalHierarchyFixture(), tree:[], people:[], focusOptions:[], totalAgents:0};
    vi.mocked(getPortalHierarchy).mockResolvedValueOnce(second);
    const view = renderHook(() => usePortalHierarchy());
    await waitFor(() => expect(getPortalHierarchy).toHaveBeenCalledOnce());
    const firstSignal = vi.mocked(getPortalHierarchy).mock.calls[0][1];
    token = 'second-account'; view.rerender();
    expect(firstSignal?.aborted).toBe(true);
    await waitFor(() => expect(view.result.current.data).toEqual(second));
    await act(async () => finishFirst(portalHierarchyFixture()));
    expect(view.result.current.data).toEqual(second);
    token = undefined; view.rerender();
    expect(view.result.current.data).toBeNull();
  });
  it('supports retry after failure and cancels requests when unmounted', async () => {
    vi.mocked(getPortalHierarchy).mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce(portalHierarchyFixture());
    const view = renderHook(() => usePortalHierarchy());
    await waitFor(() => expect(view.result.current.error).toBe('Unavailable'));
    await act(() => view.result.current.reload());
    expect(view.result.current.data?.totalAgents).toBe(5);
    const signal = vi.mocked(getPortalHierarchy).mock.calls[1][1];
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });
});
