import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PortalLeadSpplyUserId from '@/components/PortalLeadSpplyUserId';
import type { OwnIntegrationStatus } from '@/lib/portal-leadspply-integration';
const id = '10000000-0000-4000-8000-000000000001';
const connection = { status: null as OwnIntegrationStatus | null, loading: false, error: null as string | null, reload: vi.fn() };
vi.mock('@/hooks/useOwnLeadSpplyIntegration', () => ({ useOwnLeadSpplyIntegration: () => connection }));
const draw = () => render(<MemoryRouter><PortalLeadSpplyUserId /></MemoryRouter>);
afterEach(cleanup);
beforeEach(() => { connection.status = null; connection.loading = false; connection.error = null; connection.reload.mockClear(); });
describe('profile LeadSpply ID', () => {
  it('shows the confirmed ID as read-only text', () => {
    connection.status = { state: 'connected', account: { leadspply_user_id: id, name: 'Test Rep', email: 'test@example.com', sync_status: 'pending', synced_at: null, pay_tier: null, linked_at: '2026-10-21T12:00:00Z' } };
    draw();
    expect(screen.getByText(id)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
  it('offers connection for an unlinked user', () => {
    connection.status = { state: 'not_linked', account: null }; draw();
    expect(screen.getByRole('link', {name: 'Connect LeadSpply'})).toHaveAttribute('href', '/portal/leadspply');
  });
  it('distinguishes a failed lookup from an unlinked user and permits retry', () => {
    connection.error = 'unavailable'; draw();
    expect(screen.getByRole('status')).toHaveTextContent('Unable to load');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Try again'})); expect(connection.reload).toHaveBeenCalledOnce();
  });
});
