import { expect, it } from 'vitest';
import { paySourceAccountId } from '@/lib/portal-pay';
import { assertPaySourceAccount, hubSetupRequest } from '../../supabase/functions/_shared/pnclPayLaunch';

const id = '22222222-2222-4222-8222-222222222222';
it('preserves normal Hub requests and strips the optional Pay guard before calling LeadSpply', () => {
  expect(hubSetupRequest({ action: 'pay' })).toEqual({ body: { action: 'pay' }, expectedAccountId: null });
  expect(hubSetupRequest({ action: 'pay', expectedAccountId: id })).toEqual({ body: { action: 'pay' }, expectedAccountId: id });
  expect(() => hubSetupRequest({ action: 'status', expectedAccountId: id })).toThrow('invalid_request');
  expect(() => hubSetupRequest({ action: 'pay', expectedAccountId: 'wrong' })).toThrow('invalid_request');
  expect(() => hubSetupRequest({ action: 'pay', expectedAccountId: id, email: 'someone@thepncl.com' })).toThrow('invalid_request');
});
it('blocks the wrong linked account before issuing a Pay login link', () => {
  expect(() => assertPaySourceAccount(id, { id })).not.toThrow();
  expect(() => assertPaySourceAccount(null, null)).not.toThrow();
  expect(() => assertPaySourceAccount(id, null)).toThrow('pay_account_mismatch');
  expect(() => assertPaySourceAccount(id, { id: '33333333-3333-4333-8333-333333333333' })).toThrow('pay_account_mismatch');
});
it('accepts an exact account-only launch query and rejects ambiguous or injected destinations', () => {
  expect(paySourceAccountId('')).toBeNull();
  expect(paySourceAccountId('?leadspplyUserId=' + id)).toBe(id);
  for (const search of ['?leadspplyUserId=', '?leadspplyUserId=bad', '?leadspplyUserId=' + id + '&leadspplyUserId=' + id, '?returnTo=https://evil.test', '?leadspplyUserId=' + id + '&token=secret']) {
    expect(() => paySourceAccountId(search)).toThrow('invalid_request');
  }
});
