export interface Person {
  id: string;
  name: string;
}

export interface Expense {
  id: string;
  description: string;
  amountCents: number;
  paidBy: string;
  shares: Record<string, number>;
  createdAt: string;
}

export interface Transfer {
  id: string;
  from: string;
  to: string;
  amountCents: number;
  createdAt: string;
}

export interface Balance {
  personId: string;
  cents: number;
}

export interface SuggestedPayment {
  from: string;
  to: string;
  amountCents: number;
}

export function calculateBalances(
  people: Person[],
  expenses: Expense[],
  transfers: Transfer[],
): Balance[] {
  const balances = new Map(people.map((person) => [person.id, 0]));

  for (const expense of expenses) {
    balances.set(expense.paidBy, (balances.get(expense.paidBy) ?? 0) + expense.amountCents);
    for (const [personId, share] of Object.entries(expense.shares)) {
      balances.set(personId, (balances.get(personId) ?? 0) - share);
    }
  }

  for (const transfer of transfers) {
    balances.set(transfer.from, (balances.get(transfer.from) ?? 0) + transfer.amountCents);
    balances.set(transfer.to, (balances.get(transfer.to) ?? 0) - transfer.amountCents);
  }

  return people.map(({ id }) => ({ personId: id, cents: balances.get(id) ?? 0 }));
}

export function suggestPayments(balances: Balance[]): SuggestedPayment[] {
  const debtors = balances
    .filter(({ cents }) => cents < 0)
    .map(({ personId, cents }) => ({ personId, cents: -cents }))
    .sort((a, b) => b.cents - a.cents);
  const creditors = balances
    .filter(({ cents }) => cents > 0)
    .map(({ personId, cents }) => ({ personId, cents }))
    .sort((a, b) => b.cents - a.cents);

  const payments: SuggestedPayment[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amountCents = Math.min(debtor.cents, creditor.cents);

    if (amountCents > 0) {
      payments.push({ from: debtor.personId, to: creditor.personId, amountCents });
      debtor.cents -= amountCents;
      creditor.cents -= amountCents;
    }

    if (debtor.cents === 0) debtorIndex += 1;
    if (creditor.cents === 0) creditorIndex += 1;
  }

  return payments;
}

export function splitEqually(totalCents: number, personIds: string[]): Record<string, number> {
  if (personIds.length === 0) return {};

  const baseShare = Math.floor(totalCents / personIds.length);
  let remainder = totalCents - baseShare * personIds.length;

  return Object.fromEntries(
    personIds.map((personId) => {
      const extraCent = remainder > 0 ? 1 : 0;
      remainder -= extraCent;
      return [personId, baseShare + extraCent];
    }),
  );
}
