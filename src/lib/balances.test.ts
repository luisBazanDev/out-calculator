import { describe, expect, it } from 'vitest';
import { calculateBalances, splitEqually, suggestPayments } from './balances';

describe('expense balances', () => {
  it('accounts for who paid and each person’s share', () => {
    const balances = calculateBalances(
      [{ id: 'ana', name: 'Ana' }, { id: 'leo', name: 'Leo' }],
      [{
        id: 'dinner',
        description: 'Cena',
        amountCents: 2400,
        paidBy: 'ana',
        shares: { ana: 1200, leo: 1200 },
        createdAt: '',
      }],
      [],
    );

    expect(balances).toEqual([{ personId: 'ana', cents: 1200 }, { personId: 'leo', cents: -1200 }]);
  });

  it('subtracts transfers already made from the outstanding balance', () => {
    const balances = calculateBalances(
      [{ id: 'ana', name: 'Ana' }, { id: 'leo', name: 'Leo' }],
      [{
        id: 'dinner',
        description: 'Cena',
        amountCents: 2400,
        paidBy: 'ana',
        shares: { ana: 1200, leo: 1200 },
        createdAt: '',
      }],
      [{ id: 'payment', from: 'leo', to: 'ana', amountCents: 500, createdAt: '' }],
    );

    expect(balances).toEqual([{ personId: 'ana', cents: 700 }, { personId: 'leo', cents: -700 }]);
  });

  it('splits cents evenly without losing the remainder', () => {
    expect(splitEqually(1000, ['a', 'b', 'c'])).toEqual({ a: 334, b: 333, c: 333 });
  });

  it('suggests transfers that settle every balance', () => {
    const payments = suggestPayments([
      { personId: 'a', cents: 1000 },
      { personId: 'b', cents: -400 },
      { personId: 'c', cents: -600 },
    ]);

    expect(payments).toEqual([
      { from: 'c', to: 'a', amountCents: 600 },
      { from: 'b', to: 'a', amountCents: 400 },
    ]);
  });
});
