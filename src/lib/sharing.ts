import type { Expense, Person, Transfer } from './balances';

export interface SharedTrip {
  name: string;
  people: Person[];
  expenses: Expense[];
  transfers: Transfer[];
}

const SHARE_VERSION = 1;
const MAX_ENCODED_LENGTH = 16_000;
const MAX_PEOPLE = 100;
const MAX_EXPENSES = 500;
const MAX_TRANSFERS = 1_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown, maxLength: number, allowEmpty = false): value is string {
  return typeof value === 'string'
    && value.length <= maxLength
    && (allowEmpty || value.trim().length > 0);
}

function isCents(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validateTrip(value: unknown): SharedTrip {
  if (!isRecord(value)
    || !isText(value.name, 60)
    || !Array.isArray(value.people)
    || value.people.length > MAX_PEOPLE
    || !Array.isArray(value.expenses)
    || value.expenses.length > MAX_EXPENSES
    || !Array.isArray(value.transfers)
    || value.transfers.length > MAX_TRANSFERS) {
    throw new Error('El contenido del enlace no tiene un formato válido.');
  }

  const people: Person[] = [];
  const peopleIds = new Set<string>();
  for (const valuePerson of value.people) {
    if (!isRecord(valuePerson)
      || !isText(valuePerson.id, 100)
      || !isText(valuePerson.name, 30)
      || peopleIds.has(valuePerson.id)) {
      throw new Error('El enlace contiene participantes inválidos.');
    }
    peopleIds.add(valuePerson.id);
    people.push({ id: valuePerson.id, name: valuePerson.name.trim() });
  }

  const expenses: Expense[] = [];
  const expenseIds = new Set<string>();
  for (const valueExpense of value.expenses) {
    if (!isRecord(valueExpense)
      || !isText(valueExpense.id, 100)
      || expenseIds.has(valueExpense.id)
      || !isText(valueExpense.description, 70)
      || !isCents(valueExpense.amountCents)
      || valueExpense.amountCents === 0
      || !isText(valueExpense.paidBy, 100)
      || !peopleIds.has(valueExpense.paidBy)
      || !isDate(valueExpense.createdAt)
      || !isRecord(valueExpense.shares)) {
      throw new Error('El enlace contiene gastos inválidos.');
    }

    const shares: Record<string, number> = {};
    for (const [personId, share] of Object.entries(valueExpense.shares)) {
      if (!peopleIds.has(personId) || !isCents(share)) {
        throw new Error('El enlace contiene repartos inválidos.');
      }
      shares[personId] = share;
    }
    if (Object.values(shares).reduce((sum, share) => sum + share, 0) !== valueExpense.amountCents) {
      throw new Error('Las partes de un gasto no coinciden con su importe.');
    }

    expenseIds.add(valueExpense.id);
    expenses.push({
      id: valueExpense.id,
      description: valueExpense.description.trim(),
      amountCents: valueExpense.amountCents,
      paidBy: valueExpense.paidBy,
      shares,
      createdAt: valueExpense.createdAt,
    });
  }

  const transfers: Transfer[] = [];
  const transferIds = new Set<string>();
  for (const valueTransfer of value.transfers) {
    if (!isRecord(valueTransfer)
      || !isText(valueTransfer.id, 100)
      || transferIds.has(valueTransfer.id)
      || !isText(valueTransfer.from, 100)
      || !isText(valueTransfer.to, 100)
      || valueTransfer.from === valueTransfer.to
      || !peopleIds.has(valueTransfer.from)
      || !peopleIds.has(valueTransfer.to)
      || !isCents(valueTransfer.amountCents)
      || valueTransfer.amountCents === 0
      || !isDate(valueTransfer.createdAt)) {
      throw new Error('El enlace contiene pagos inválidos.');
    }
    transferIds.add(valueTransfer.id);
    transfers.push({
      id: valueTransfer.id,
      from: valueTransfer.from,
      to: valueTransfer.to,
      amountCents: valueTransfer.amountCents,
      createdAt: valueTransfer.createdAt,
    });
  }

  return { name: value.name.trim(), people, expenses, transfers };
}

export function encodeSharedTrip(trip: SharedTrip): string {
  const payload = JSON.stringify({ version: SHARE_VERSION, trip: validateTrip(trip) });
  const bytes = new TextEncoder().encode(payload);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  if (encoded.length > MAX_ENCODED_LENGTH) {
    throw new Error('La salida es demasiado grande para compartirla en un enlace.');
  }
  return encoded;
}

export function decodeSharedTrip(encoded: string): SharedTrip {
  if (!encoded || encoded.length > MAX_ENCODED_LENGTH || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new Error('El enlace compartido está incompleto o es demasiado grande.');
  }

  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const payload: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!isRecord(payload) || payload.version !== SHARE_VERSION) {
      throw new Error('Esta versión del enlace compartido no es compatible.');
    }
    return validateTrip(payload.trip);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('El enlace')) throw error;
    if (error instanceof Error && error.message.startsWith('Esta versión')) throw error;
    if (error instanceof Error && /participantes|gastos|pagos|repartos|partes/.test(error.message)) throw error;
    throw new Error('No se pudo leer el enlace compartido. Puede estar dañado.');
  }
}
