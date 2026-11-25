import { describe, expect, it } from 'vitest';
import {
  decodeSharedTrip,
  encodeSharedTrip,
  exportSharedTrip,
  importSharedTripFile,
  type SharedTrip,
} from './sharing';

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

  it('reads links created with the previous uncompressed format', () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ version: 1, trip }));
    const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
    const payload = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

    expect(decodeSharedTrip(payload)).toEqual(trip);
  });

  it('compresses larger trips so they can still fit in a link', () => {
    const largerTrip: SharedTrip = {
      ...trip,
      expenses: Array.from({ length: 400 }, (_, index) => ({
        ...trip.expenses[0],
        id: `expense-${index}`,
        description: `Gasto compartido del viaje número ${index}`,
      })),
    };

    const encoded = encodeSharedTrip(largerTrip);

    expect(encoded.startsWith('z.')).toBe(true);
    expect(encoded.length).toBeLessThan(16_000);
    expect(decodeSharedTrip(encoded)).toEqual(largerTrip);
  });

  it('exports and imports the same trip data without changing its shape', () => {
    const fileContents = exportSharedTrip(trip);

    expect(Object.keys(JSON.parse(fileContents))).toEqual(['name', 'people', 'expenses', 'transfers']);
    expect(importSharedTripFile(fileContents)).toEqual(trip);
    expect(() => importSharedTripFile('not JSON')).toThrow('archivo JSON de Vaquita');
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
