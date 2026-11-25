import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { calculateBalances, suggestPayments } from './balances';
import type { SharedTrip } from './sharing';

pdfMake.addVirtualFileSystem(pdfFonts);

const moneyFormat = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const dateFormat = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
const exportedAtFormat = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'long',
  timeStyle: 'short',
});

const money = (cents: number) => moneyFormat.format(cents / 100);
const date = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Fecha no disponible' : dateFormat.format(parsed);
};

export async function downloadTripPdf(trip: SharedTrip) {
  const personName = (id: string) => trip.people.find((person) => person.id === id)?.name ?? 'Participante eliminado';
  const totalExpenses = trip.expenses.reduce((sum, expense) => sum + expense.amountCents, 0);
  const totalTransfers = trip.transfers.reduce((sum, transfer) => sum + transfer.amountCents, 0);
  const totalsByPerson = new Map(trip.people.map(({ id }) => [id, { paid: 0, shared: 0 }]));

  for (const expense of trip.expenses) {
    const payer = totalsByPerson.get(expense.paidBy);
    if (payer) payer.paid += expense.amountCents;
    for (const [personId, share] of Object.entries(expense.shares)) {
      const totals = totalsByPerson.get(personId);
      if (totals) totals.shared += share;
    }
  }

  const balances = calculateBalances(trip.people, trip.expenses, trip.transfers);
  const balanceByPerson = new Map(balances.map(({ personId, cents }) => [personId, cents]));
  const suggestedPayments = suggestPayments(balances);
  const sortedExpenses = [...trip.expenses].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const sortedTransfers = [...trip.transfers].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const exportedAt = exportedAtFormat.format(new Date());
  const content: unknown[] = [
    { text: trip.name, style: 'title' },
    { text: `Resumen de transacciones · Exportado el ${exportedAt}`, style: 'subtitle' },
    {
      table: {
        widths: ['*', '*'],
        body: [
          [
            { text: 'Gastos registrados', style: 'metricLabel' },
            { text: 'Pagos registrados', style: 'metricLabel' },
          ],
          [
            { text: money(totalExpenses), style: 'metricValue' },
            { text: money(totalTransfers), style: 'metricValue' },
          ],
        ],
      },
      layout: 'noBorders',
      margin: [0, 14, 0, 8],
    },
    { text: `Participantes: ${trip.people.map(({ name }) => name).join(', ') || 'Sin participantes'}`, style: 'body' },
    { text: 'Balance por persona', style: 'sectionTitle', headlineLevel: 1 },
  ];

  if (trip.people.length > 0) {
    content.push(makeTable(
      ['Participante', 'Pagó', 'Le corresponde', 'Balance final'],
      trip.people.map((person) => {
        const balance = balanceByPerson.get(person.id) ?? 0;
        const balanceLabel = balance > 0
          ? `${money(balance)} · recibe`
          : balance < 0
            ? `${money(Math.abs(balance))} · debe`
            : 'Al día';
        const totals = totalsByPerson.get(person.id) ?? { paid: 0, shared: 0 };
        return [person.name, money(totals.paid), money(totals.shared), balanceLabel];
      }),
      [170, 135, 155, '*'],
    ));
  } else {
    content.push({ text: 'No hay participantes registrados.', style: 'emptyState' });
  }

  content.push({ text: 'Pagos sugeridos para saldar cuentas', style: 'sectionTitle', headlineLevel: 1 });
  if (suggestedPayments.length > 0) {
    content.push(makeTable(
      ['Quién paga', 'Quién recibe', 'Importe'],
      suggestedPayments.map(({ from, to, amountCents }) => [personName(from), personName(to), money(amountCents)]),
      [250, 250, '*'],
    ));
  } else {
    content.push({ text: 'No hay pagos pendientes según los movimientos registrados.', style: 'emptyState' });
  }

  content.push({ text: 'Gastos', style: 'sectionTitle', headlineLevel: 1 });
  if (sortedExpenses.length > 0) {
    content.push(makeTable(
      ['Fecha', 'Concepto', 'Pagó', 'Importe', 'Reparto por participante'],
      sortedExpenses.map((expense) => [
        date(expense.createdAt),
        expense.description,
        personName(expense.paidBy),
        money(expense.amountCents),
        Object.entries(expense.shares)
          .map(([personId, share]) => `${personName(personId)}: ${money(share)}`)
          .join('\n'),
      ]),
      [75, 160, 105, 85, '*'],
    ));
  } else {
    content.push({ text: 'No hay gastos registrados.', style: 'emptyState' });
  }

  content.push({ text: 'Pagos ya realizados', style: 'sectionTitle', headlineLevel: 1 });
  if (sortedTransfers.length > 0) {
    content.push(makeTable(
      ['Fecha', 'Quién envió', 'Quién recibió', 'Importe'],
      sortedTransfers.map((transfer) => [
        date(transfer.createdAt),
        personName(transfer.from),
        personName(transfer.to),
        money(transfer.amountCents),
      ]),
      [100, 220, 220, '*'],
    ));
  } else {
    content.push({ text: 'No hay pagos realizados registrados.', style: 'emptyState' });
  }

  const fileName = trip.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLocaleLowerCase('es') || 'salida';

  const definition: Record<string, unknown> = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [36, 46, 36, 42],
    defaultStyle: { font: 'Roboto', fontSize: 9, color: '#26332b' },
    header: (page: number) => page === 1 ? '' : ({
      text: trip.name,
      margin: [36, 18, 36, 0],
      fontSize: 8,
      color: '#617269',
    }),
    footer: (page: number, pages: number) => ({
      text: `${page} / ${pages}`,
      alignment: 'right',
      margin: [36, 0, 36, 16],
      fontSize: 8,
      color: '#617269',
    }),
    content,
    styles: {
      title: { fontSize: 22, bold: true, color: '#1f6847', margin: [0, 0, 0, 4] },
      subtitle: { fontSize: 9, color: '#617269', margin: [0, 0, 0, 8] },
      body: { fontSize: 9, margin: [0, 5, 0, 4] },
      metricLabel: { fontSize: 8, bold: true, color: '#617269', fillColor: '#f1f6f1', margin: [8, 7, 8, 2] },
      metricValue: { fontSize: 15, bold: true, color: '#1f6847', fillColor: '#f1f6f1', margin: [8, 0, 8, 8] },
      sectionTitle: { fontSize: 13, bold: true, color: '#1f6847', margin: [0, 14, 0, 7] },
      tableHeader: { fontSize: 8, bold: true, color: '#ffffff', fillColor: '#1f6847' },
      emptyState: { fontSize: 9, color: '#617269', italics: true, margin: [0, 0, 0, 6] },
    },
  };
  await pdfMake.createPdf(definition).download(`${fileName}.pdf`);
}

function makeTable(headers: string[], rows: string[][], widths: (number | '*')[]) {
  return {
    table: {
      headerRows: 1,
      widths,
      body: [
        headers.map((text) => ({ text, style: 'tableHeader' })),
        ...rows,
      ],
    },
    layout: {
      hLineColor: '#dce5dd',
      vLineColor: '#dce5dd',
      hLineWidth: (index: number) => index === 1 ? 1 : 0.5,
      vLineWidth: () => 0,
      paddingLeft: () => 7,
      paddingRight: () => 7,
      paddingTop: () => 5,
      paddingBottom: () => 5,
      fillColor: (rowIndex: number) => rowIndex > 0 && rowIndex % 2 === 0 ? '#f6f8f5' : null,
    },
    fontSize: 8,
    margin: [0, 0, 0, 5],
  };
}
