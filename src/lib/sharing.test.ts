import { describe, expect, it } from 'vitest';
import { decodeSharedTrip, encodeSharedTrip, type SharedTrip } from './sharing';

const trip: SharedTrip = {
  name: 'Viaje a Cusco 🏔️',
  people: [{ id: 'ana', name: 'Ana' }, { id: 'josé', name: 'José' }],
  expenses: [{
    id: 'dinner',
    description: 'Cena 🍲',
    amountCents: 2_500,
    paidBy: 'ana',
    shares: { ana: 1_000, 'josé': 1_500 },
    createdAt: '2026-10-21T10:00:00.000Z',
  }],
  transfers: [{
    id: 'payment',
    from: 'josé',
    to: 'ana',
    amountCents: 500,
    createdAt: '2026-10-21T11:00:00.000Z',
  }],
};

describe('shared trip links', () => {
  it('round-trips a trip with Unicode text and money movements', () => {
    expect(decodeSharedTrip(encodeSharedTrip(trip))).toEqual(trip);
  });

  it('rejects malformed content and unsupported versions', () => {
    expect(() => decodeSharedTrip('not-valid-base64!')).toThrow('incompleto');

    const unsupported = btoa(JSON.stringify({
      version: 2,
      trip: { name: 'Viaje', people: [], expenses: [], transfers: [] },
    })).replace(/=+$/g, '');
    expect(() => decodeSharedTrip(unsupported)).toThrow('no es compatible');
  });

  it('rejects expenses whose shares do not add up', () => {
    const invalidTrip = structuredClone(trip);
    invalidTrip.expenses[0].shares.ana = 900;
    expect(() => encodeSharedTrip(invalidTrip)).toThrow('no coinciden');
  });
});
