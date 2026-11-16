import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePortalTeamStats } from './usePortalTeamStats';
import { getPortalTeamStats } from '@/lib/portal-team-stats';
import { teamStatsFixture } from '@/test/fixtures/portal-team-stats';
let token: string | undefined;
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ session: token ? {access_token:token} : null, loading:false }) }));
vi.mock('@/lib/portal-team-stats', async (original) => ({ ...await original<typeof import('@/lib/portal-team-stats')>(), getPortalTeamStats:vi.fn() }));
beforeEach(() => { token = 'first-account'; vi.mocked(getPortalTeamStats).mockReset(); });
describe('team stats request lifecycle', () => {
  it('discards in-flight results after an account change and clears data on sign-out', async () => {
    let finishFirst!: (value: ReturnType<typeof teamStatsFixture>) => void;
    vi.mocked(getPortalTeamStats).mockImplementationOnce(() => new Promise(resolve => {finishFirst = resolve;}));
    const second = {...teamStatsFixture(), people:[]};
    vi.mocked(getPortalTeamStats).mockResolvedValueOnce(second);
    const view = renderHook(() => usePortalTeamStats('month'));
    await waitFor(() => expect(getPortalTeamStats).toHaveBeenCalledOnce());
    const firstSignal = vi.mocked(getPortalTeamStats).mock.calls[0][2];
    token = 'second-account'; view.rerender();
    expect(firstSignal?.aborted).toBe(true);
    await waitFor(() => expect(view.result.current.data).toEqual(second));
    await act(async () => finishFirst(teamStatsFixture()));
    expect(view.result.current.data).toEqual(second);
    token = undefined; view.rerender();
    expect(view.result.current.data).toBeNull();
  });
  it('discards an older period response when the filter changes', async () => {
    let finish!: (value: ReturnType<typeof teamStatsFixture>) => void;
    vi.mocked(getPortalTeamStats).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const week = { ...teamStatsFixture(), period: { ...teamStatsFixture().period, key: 'week' as const } };
    vi.mocked(getPortalTeamStats).mockResolvedValueOnce(week);
    const view = renderHook(({period}: {period:'week'|'month'}) => usePortalTeamStats(period), {initialProps:{period:'month'}});
    view.rerender({period:'week'});
    await waitFor(() => expect(view.result.current.data?.period.key).toBe('week'));
    await act(async () => finish(teamStatsFixture()));
    expect(view.result.current.data?.period.key).toBe('week');
  });
  it('supports retry after failure and cancels requests when unmounted', async () => {
    vi.mocked(getPortalTeamStats).mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce(teamStatsFixture());
    const view = renderHook(() => usePortalTeamStats('month'));
    await waitFor(() => expect(view.result.current.error).toBe('Unavailable'));
    await act(() => view.result.current.reload());
    expect(view.result.current.data?.people.length).toBe(5);
    const signal = vi.mocked(getPortalTeamStats).mock.calls[1][2];
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });
});
