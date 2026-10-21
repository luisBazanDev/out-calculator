import {
  calculateBalances,
  splitEqually,
  suggestPayments,
  type Expense,
  type Person,
  type Transfer,
} from '../lib/balances';
import { decodeSharedTrip, encodeSharedTrip, type SharedTrip } from '../lib/sharing';

interface Trip extends SharedTrip { id: string }

const STORAGE_KEY = 'vaquita-trips-v1';
const LEGACY_STORAGE_KEY = 'vaquita-trip-v1';
const amountFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatMoney = (cents: number) => `S/. ${amountFormat.format(cents / 100)}`;
const dateFormat = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
const newTrip = (name = 'Nuestra salida'): Trip => ({ id: makeId(), name, people: [], expenses: [], transfers: [] });

const savedState = loadTrips();
let savedTrips = savedState.trips;
let activeTripId = savedState.activeTripId;
const sharedLink = readSharedLink();
let isSharedPreview = Boolean(sharedLink.trip);
let trip = sharedLink.trip
  ? { ...sharedLink.trip, id: makeId() }
  : savedTrips.find(({ id }) => id === activeTripId) ?? savedTrips[0] ?? newTrip();
let selectedPeople = new Set(trip.people.map(({ id }) => id));
let customShares: Record<string, string> = {};

const byId = <T extends HTMLElement>(id: string) => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`No se encontró el elemento #${id}`);
  return element as T;
};

const elements = {
  tripName: byId<HTMLInputElement>('trip-name'),
  tripSwitcher: byId<HTMLSelectElement>('trip-switcher'),
  clearTrip: byId<HTMLButtonElement>('clear-trip'),
  shareTrip: byId<HTMLButtonElement>('share-trip'),
  shareStatus: byId<HTMLSpanElement>('share-status'),
  saveStatus: byId<HTMLSpanElement>('save-status'),
  sharedBanner: byId<HTMLElement>('shared-banner'),
  sharedMessage: byId<HTMLParagraphElement>('shared-message'),
  saveSharedCopy: byId<HTMLButtonElement>('save-shared-copy'),
  leaveSharedPreview: byId<HTMLButtonElement>('leave-shared-preview'),
  personForm: byId<HTMLFormElement>('person-form'),
  personName: byId<HTMLInputElement>('person-name'),
  personError: byId<HTMLParagraphElement>('person-error'),
  peopleList: byId<HTMLUListElement>('people-list'),
  peopleEmpty: byId<HTMLParagraphElement>('people-empty'),
  peopleCount: byId<HTMLParagraphElement>('people-count'),
  expenseForm: byId<HTMLFormElement>('expense-form'),
  expenseDescription: byId<HTMLInputElement>('expense-description'),
  expenseAmount: byId<HTMLInputElement>('expense-amount'),
  expensePayer: byId<HTMLSelectElement>('expense-payer'),
  splitMode: byId<HTMLSelectElement>('split-mode'),
  expenseParticipants: byId<HTMLDivElement>('expense-participants'),
  participantsEmpty: byId<HTMLParagraphElement>('participants-empty'),
  expenseError: byId<HTMLParagraphElement>('expense-error'),
  expenseSubmit: byId<HTMLButtonElement>('expense-submit'),
  groupTotal: byId<HTMLParagraphElement>('group-total'),
  balanceCaption: byId<HTMLParagraphElement>('balance-caption'),
  balanceList: byId<HTMLDivElement>('balance-list'),
  expenseCount: byId<HTMLParagraphElement>('expense-count'),
  expenseList: byId<HTMLUListElement>('expense-list'),
  expensesEmpty: byId<HTMLParagraphElement>('expenses-empty'),
  suggestionList: byId<HTMLUListElement>('suggestion-list'),
  suggestionsEmpty: byId<HTMLParagraphElement>('suggestions-empty'),
  transferForm: byId<HTMLFormElement>('transfer-form'),
  transferFrom: byId<HTMLSelectElement>('transfer-from'),
  transferTo: byId<HTMLSelectElement>('transfer-to'),
  transferAmount: byId<HTMLInputElement>('transfer-amount'),
  transferSubmit: byId<HTMLButtonElement>('transfer-submit'),
  transferError: byId<HTMLParagraphElement>('transfer-error'),
  transferCount: byId<HTMLSpanElement>('transfer-count'),
  transferList: byId<HTMLUListElement>('transfer-list'),
  transfersEmpty: byId<HTMLParagraphElement>('transfers-empty'),
};

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeStoredTrip(value: unknown): Trip | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Partial<Trip>;
  if (typeof candidate.name !== 'string'
    || !Array.isArray(candidate.people)
    || !Array.isArray(candidate.expenses)
    || !Array.isArray(candidate.transfers)) return null;
  return {
    id: typeof candidate.id === 'string' && candidate.id ? candidate.id : makeId(),
    name: candidate.name,
    people: candidate.people as Person[],
    expenses: candidate.expenses as Expense[],
    transfers: candidate.transfers as Transfer[],
  };
}

function loadTrips(): { trips: Trip[]; activeTripId: string } {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        const stored = parsed as { trips?: unknown; activeTripId?: unknown };
        const trips = Array.isArray(stored.trips)
          ? stored.trips.map(normalizeStoredTrip).filter((item): item is Trip => item !== null)
          : [];
        if (trips.length > 0) {
          const activeTripId = trips.some(({ id }) => id === stored.activeTripId)
            ? stored.activeTripId as string
            : trips[0].id;
          return { trips, activeTripId };
        }
      }
    }

    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const migrated = normalizeStoredTrip(JSON.parse(legacy));
      if (migrated) return { trips: [migrated], activeTripId: migrated.id };
    }
  } catch {
    // Recover with a fresh local collection if saved browser data is malformed.
  }
  const initialTrip = newTrip();
  return { trips: [initialTrip], activeTripId: initialTrip.id };
}

function saveTrip() {
  if (isSharedPreview) return;
  try {
    const index = savedTrips.findIndex(({ id }) => id === trip.id);
    if (index === -1) savedTrips.push(trip);
    else savedTrips[index] = trip;
    activeTripId = trip.id;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ activeTripId, trips: savedTrips }));
  } catch {
    // The app remains usable if the browser blocks local storage.
  }
}

function readSharedLink(): { trip: SharedTrip | null; error: string | null } {
  const hash = window.location.hash;
  const hashMatch = hash.match(/^#share-content=(.*)$/);
  const queryPayload = new URLSearchParams(window.location.search).get('share-content');
  const payload = hashMatch?.[1] ?? queryPayload;
  if (!payload) return { trip: null, error: null };
  try {
    return { trip: decodeSharedTrip(payload), error: null };
  } catch (error) {
    return {
      trip: null,
      error: error instanceof Error ? error.message : 'No se pudo abrir el enlace compartido.',
    };
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

function amountToCents(value: string) {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function nameFor(id: string) {
  return trip.people.find((person) => person.id === id)?.name ?? 'Participante eliminado';
}

function renderSelect(select: HTMLSelectElement, placeholder: string, selectedId?: string) {
  const currentValue = selectedId ?? select.value;
  select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${trip.people.map((person) =>
    `<option value="${escapeHtml(person.id)}">${escapeHtml(person.name)}</option>`,
  ).join('')}`;
  select.disabled = trip.people.length === 0;
  if (trip.people.some((person) => person.id === currentValue)) select.value = currentValue;
  else if (trip.people[0]) select.value = trip.people[0].id;
  else select.value = '';
}

function renderPeople() {
  elements.peopleCount.textContent = `${trip.people.length} ${trip.people.length === 1 ? 'persona' : 'personas'}`;
  elements.peopleEmpty.hidden = trip.people.length > 0;
  elements.peopleList.innerHTML = trip.people.map((person) => {
    const isInUse = trip.expenses.some((expense) => expense.paidBy === person.id || person.id in expense.shares)
      || trip.transfers.some((transfer) => transfer.from === person.id || transfer.to === person.id);
    const disabled = isInUse ? 'disabled title="Este participante aparece en un movimiento; bórralo antes de quitarlo."' : '';
    return `<li class="flex items-center justify-between rounded-xl px-2 py-2">
      <span class="flex min-w-0 items-center gap-3 text-sm font-semibold"><span class="grid size-9 shrink-0 place-items-center rounded-full bg-[#edf3ed] text-xs font-bold text-leaf">${escapeHtml(initials(person.name))}</span><span class="truncate">${escapeHtml(person.name)}</span></span>
      <button type="button" data-remove-person="${escapeHtml(person.id)}" ${disabled} aria-label="Quitar a ${escapeHtml(person.name)}" class="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"><svg viewBox="0 0 20 20" class="size-4" fill="none" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" /></svg></button>
    </li>`;
  }).join('');
  renderSelect(elements.expensePayer, '¿Quién pagó?');
  renderSelect(elements.transferFrom, 'Quién envió');
  renderSelect(elements.transferTo, 'Quién recibió');
  const hasPeople = trip.people.length > 0;
  elements.expenseSubmit.disabled = !hasPeople;
  elements.transferSubmit.disabled = trip.people.length < 2;
  renderExpenseParticipants();
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase('es')).join('');
}

function renderTripSwitcher() {
  elements.tripSwitcher.innerHTML = savedTrips.map((savedTrip) =>
    `<option value="${escapeHtml(savedTrip.id)}">${escapeHtml(savedTrip.name || 'Salida sin nombre')}</option>`,
  ).join('');
  elements.tripSwitcher.value = activeTripId;
}

function renderSharedBanner() {
  const showPreview = isSharedPreview && sharedLink.trip !== null;
  const showError = !isSharedPreview && sharedLink.error !== null;
  elements.sharedBanner.hidden = !showPreview && !showError;
  elements.saveSharedCopy.hidden = !showPreview;
  elements.leaveSharedPreview.hidden = !showPreview && !showError;
  elements.leaveSharedPreview.textContent = showPreview ? 'Volver a mis salidas' : 'Cerrar aviso';
  if (showPreview) {
    elements.sharedMessage.textContent = `Estás viendo una copia compartida de «${trip.name}». Guárdala como una salida nueva para conservarla; tus salidas actuales no se modificarán. Cualquiera que tenga el enlace podrá ver estos datos.`;
  } else if (showError) {
    elements.sharedMessage.textContent = `${sharedLink.error} Se abrió tu salida guardada en este dispositivo.`;
  }
}

function applySharedPreviewMode() {
  const main = byId<HTMLElement>('inicio');
  main.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button').forEach((control) => {
    control.disabled = isSharedPreview;
  });
  elements.tripName.readOnly = isSharedPreview;
  elements.tripSwitcher.disabled = isSharedPreview;
  elements.shareTrip.disabled = isSharedPreview;
  elements.clearTrip.disabled = isSharedPreview;
  elements.saveStatus.textContent = isSharedPreview ? 'Vista previa compartida' : 'Guardado en este dispositivo';
  renderSharedBanner();
}

function renderExpenseParticipants() {
  const hasPeople = trip.people.length > 0;
  elements.participantsEmpty.hidden = hasPeople;
  elements.expenseParticipants.innerHTML = trip.people.map((person) => {
    const checked = selectedPeople.has(person.id) ? 'checked' : '';
    const custom = elements.splitMode.value === 'custom';
    return `<label class="flex cursor-pointer items-center gap-3 rounded-xl border border-line px-3 py-2.5 transition has-[:checked]:border-[#a8d0b2] has-[:checked]:bg-[#f3f9f3]">
      <input type="checkbox" data-expense-person="${escapeHtml(person.id)}" ${checked} class="size-4 accent-[#287a54]" />
      <span class="min-w-0 flex-1 truncate text-sm font-medium">${escapeHtml(person.name)}</span>
      ${custom && selectedPeople.has(person.id) ? `<span class="flex items-center gap-1 text-sm text-muted"><span>S/.</span><input type="number" data-share="${escapeHtml(person.id)}" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(customShares[person.id] ?? '')}" aria-label="Parte de ${escapeHtml(person.name)} en soles" class="w-24 rounded-lg border border-line bg-white px-2 py-1.5 text-right text-sm text-ink" /></span>` : ''}
    </label>`;
  }).join('');
}

function renderBalances() {
  const balances = calculateBalances(trip.people, trip.expenses, trip.transfers);
  const total = trip.expenses.reduce((sum, expense) => sum + expense.amountCents, 0);
  elements.groupTotal.textContent = formatMoney(total);

  if (trip.people.length === 0) {
    elements.balanceCaption.textContent = 'Añade participantes y gastos para empezar.';
    elements.balanceList.innerHTML = '';
    return;
  }

  const hasActivity = trip.expenses.length > 0 || trip.transfers.length > 0;
  elements.balanceCaption.textContent = hasActivity ? 'Así queda cada cuenta después de los pagos anotados.' : 'El grupo está listo; añade el primer gasto.';
  elements.balanceList.innerHTML = balances.map(({ personId, cents }) => {
    const label = cents > 0 ? 'le deben' : cents < 0 ? 'debe' : 'está al día';
    const value = cents === 0 ? 'Al día' : formatMoney(Math.abs(cents));
    const color = cents > 0 ? 'text-[#c4f1d2]' : cents < 0 ? 'text-[#ffe0b7]' : 'text-white/70';
    return `<div class="flex min-w-0 items-center justify-between gap-3 rounded-2xl bg-white/10 px-3.5 py-3"><span class="truncate text-sm font-semibold">${escapeHtml(nameFor(personId))}</span><span class="shrink-0 text-right"><span class="block text-sm font-bold ${color}">${value}</span>${cents !== 0 ? `<span class="block text-[11px] text-white/60">${label}</span>` : ''}</span></div>`;
  }).join('');
}

function renderExpenses() {
  const expenses = [...trip.expenses].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  elements.expenseCount.textContent = `${expenses.length} ${expenses.length === 1 ? 'gasto' : 'gastos'}`;
  elements.expensesEmpty.hidden = expenses.length > 0;
  elements.expenseList.innerHTML = expenses.map((expense) => {
    const participants = Object.keys(expense.shares).map(nameFor).join(', ');
    return `<li class="flex items-start justify-between gap-3 rounded-2xl border border-line p-3.5">
      <div class="min-w-0"><div class="flex items-center gap-2"><span class="truncate text-sm font-bold">${escapeHtml(expense.description)}</span><span class="shrink-0 text-[11px] text-muted">${dateFormat.format(new Date(expense.createdAt))}</span></div><p class="mt-1 truncate text-xs text-muted">Pagó ${escapeHtml(nameFor(expense.paidBy))} · ${escapeHtml(participants)}</p></div>
      <span class="shrink-0 text-sm font-bold">${formatMoney(expense.amountCents)}</span>
      <button type="button" data-remove-expense="${escapeHtml(expense.id)}" aria-label="Eliminar gasto ${escapeHtml(expense.description)}" class="-mr-2 -mt-1 rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600"><svg viewBox="0 0 20 20" class="size-4" fill="none" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" /></svg></button>
    </li>`;
  }).join('');
}

function renderSuggestions() {
  const balances = calculateBalances(trip.people, trip.expenses, trip.transfers);
  const suggestions = suggestPayments(balances);
  elements.suggestionsEmpty.hidden = suggestions.length > 0;
  elements.suggestionList.innerHTML = suggestions.map((payment) => `<li class="flex items-center justify-between gap-2 rounded-2xl bg-[#f2f7f1] px-3.5 py-3">
    <span class="min-w-0 truncate text-sm"><strong>${escapeHtml(nameFor(payment.from))}</strong><span class="px-1.5 text-muted">paga a</span><strong>${escapeHtml(nameFor(payment.to))}</strong></span><span class="shrink-0 text-sm font-bold text-leaf">${formatMoney(payment.amountCents)}</span>
  </li>`).join('');
}

function renderTransfers() {
  const transfers = [...trip.transfers].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  elements.transferCount.textContent = `${transfers.length} ${transfers.length === 1 ? 'pago' : 'pagos'}`;
  elements.transfersEmpty.hidden = transfers.length > 0;
  elements.transferList.innerHTML = transfers.map((transfer) => `<li class="flex items-center justify-between gap-3 rounded-xl bg-paper px-3.5 py-3">
    <span class="min-w-0 truncate text-sm"><strong>${escapeHtml(nameFor(transfer.from))}</strong><span class="px-1 text-muted">pagó a</span><strong>${escapeHtml(nameFor(transfer.to))}</strong><span class="ml-2 text-xs text-muted">${dateFormat.format(new Date(transfer.createdAt))}</span></span>
    <span class="flex shrink-0 items-center gap-1.5"><strong class="text-sm">${formatMoney(transfer.amountCents)}</strong><button type="button" data-remove-transfer="${escapeHtml(transfer.id)}" aria-label="Eliminar pago registrado" class="rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600"><svg viewBox="0 0 20 20" class="size-4" fill="none" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" /></svg></button></span>
  </li>`).join('');
}

function render() {
  elements.tripName.value = trip.name;
  renderTripSwitcher();
  renderPeople();
  renderBalances();
  renderExpenses();
  renderSuggestions();
  renderTransfers();
  saveTrip();
  applySharedPreviewMode();
}

function clearShareFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('share-content');
  if (url.hash.startsWith('#share-content=')) url.hash = '';
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

async function copyShareLink() {
  elements.shareStatus.textContent = '';
  try {
    const payload = encodeSharedTrip(trip);
    const url = new URL(window.location.href);
    url.searchParams.delete('share-content');
    url.hash = `share-content=${payload}`;
    await navigator.clipboard.writeText(url.toString());
    elements.shareStatus.textContent = 'Enlace copiado';
  } catch (error) {
    elements.shareStatus.textContent = error instanceof Error
      ? error.message
      : 'No se pudo crear el enlace compartido.';
  }
}

function saveSharedCopy() {
  if (!isSharedPreview) return;
  const copy: Trip = {
    ...trip,
    id: makeId(),
    name: `${trip.name} (copia)`.slice(0, 60),
    people: structuredClone(trip.people),
    expenses: structuredClone(trip.expenses),
    transfers: structuredClone(trip.transfers),
  };
  savedTrips.push(copy);
  activeTripId = copy.id;
  trip = copy;
  selectedPeople = new Set(copy.people.map(({ id }) => id));
  customShares = {};
  isSharedPreview = false;
  clearShareFromUrl();
  render();
}

function leaveSharedPreview() {
  if (!isSharedPreview) {
    clearShareFromUrl();
    elements.sharedBanner.hidden = true;
    return;
  }
  isSharedPreview = false;
  trip = savedTrips.find(({ id }) => id === activeTripId) ?? savedTrips[0];
  selectedPeople = new Set(trip.people.map(({ id }) => id));
  customShares = {};
  clearShareFromUrl();
  render();
}

elements.tripName.addEventListener('input', () => {
  trip.name = elements.tripName.value.trim() || 'Nuestra salida';
  renderTripSwitcher();
  saveTrip();
});

elements.tripSwitcher.addEventListener('change', () => {
  const selectedTrip = savedTrips.find(({ id }) => id === elements.tripSwitcher.value);
  if (!selectedTrip) return;
  activeTripId = selectedTrip.id;
  trip = selectedTrip;
  selectedPeople = new Set(trip.people.map(({ id }) => id));
  customShares = {};
  elements.expenseForm.reset();
  elements.transferForm.reset();
  render();
});

elements.shareTrip.addEventListener('click', () => {
  void copyShareLink();
});

elements.saveSharedCopy.addEventListener('click', saveSharedCopy);
elements.leaveSharedPreview.addEventListener('click', leaveSharedPreview);

elements.personForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = elements.personName.value.trim();
  elements.personError.textContent = '';
  if (!name) {
    elements.personError.textContent = 'Escribe un nombre para añadir a alguien.';
    return;
  }
  if (trip.people.some((person) => person.name.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) {
    elements.personError.textContent = 'Ya hay alguien con ese nombre en el grupo.';
    return;
  }
  const person = { id: makeId(), name };
  trip.people.push(person);
  selectedPeople.add(person.id);
  elements.personName.value = '';
  render();
  elements.personName.focus();
});

elements.peopleList.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-remove-person]');
  if (!button || button.disabled) return;
  trip.people = trip.people.filter(({ id }) => id !== button.dataset.removePerson);
  selectedPeople.delete(button.dataset.removePerson ?? '');
  render();
});

elements.splitMode.addEventListener('change', () => {
  renderExpenseParticipants();
});

elements.expenseParticipants.addEventListener('change', (event) => {
  const target = event.target as HTMLInputElement;
  if (!target.matches('[data-expense-person]')) return;
  const id = target.dataset.expensePerson;
  if (!id) return;
  if (target.checked) selectedPeople.add(id);
  else selectedPeople.delete(id);
  renderExpenseParticipants();
});

elements.expenseParticipants.addEventListener('input', (event) => {
  const target = event.target as HTMLInputElement;
  const id = target.dataset.share;
  if (id) customShares[id] = target.value;
});

elements.expenseForm.addEventListener('submit', (event) => {
  event.preventDefault();
  elements.expenseError.textContent = '';
  const description = elements.expenseDescription.value.trim();
  const amountCents = amountToCents(elements.expenseAmount.value);
  const paidBy = elements.expensePayer.value;
  const participantIds = trip.people.map(({ id }) => id).filter((id) => selectedPeople.has(id));

  if (!description) elements.expenseError.textContent = 'Añade un concepto para el gasto.';
  else if (amountCents <= 0) elements.expenseError.textContent = 'El importe debe ser mayor que cero.';
  else if (!paidBy) elements.expenseError.textContent = 'Elige quién pagó el gasto.';
  else if (participantIds.length === 0) elements.expenseError.textContent = 'Selecciona al menos una persona para repartirlo.';
  if (elements.expenseError.textContent) return;

  let shares: Record<string, number>;
  if (elements.splitMode.value === 'custom') {
    shares = Object.fromEntries(participantIds.map((id) => [id, amountToCents(customShares[id] ?? '')]));
    if (Object.values(shares).some((share) => share < 0)) {
      elements.expenseError.textContent = 'Las partes no pueden ser negativas.';
      return;
    }
    if (Object.values(shares).reduce((sum, share) => sum + share, 0) !== amountCents) {
      elements.expenseError.textContent = 'La suma de las partes debe coincidir exactamente con el gasto.';
      return;
    }
  } else {
    shares = splitEqually(amountCents, participantIds);
  }

  trip.expenses.push({ id: makeId(), description, amountCents, paidBy, shares, createdAt: new Date().toISOString() });
  elements.expenseDescription.value = '';
  elements.expenseAmount.value = '';
  customShares = {};
  render();
  elements.expenseDescription.focus();
});

elements.expenseList.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-remove-expense]');
  if (!button) return;
  trip.expenses = trip.expenses.filter(({ id }) => id !== button.dataset.removeExpense);
  render();
});

elements.transferForm.addEventListener('submit', (event) => {
  event.preventDefault();
  elements.transferError.textContent = '';
  const from = elements.transferFrom.value;
  const to = elements.transferTo.value;
  const amountCents = amountToCents(elements.transferAmount.value);
  if (!from || !to) elements.transferError.textContent = 'Elige quién envió y quién recibió el dinero.';
  else if (from === to) elements.transferError.textContent = 'El pago debe ser entre dos personas distintas.';
  else if (amountCents <= 0) elements.transferError.textContent = 'El importe debe ser mayor que cero.';
  if (elements.transferError.textContent) return;

  trip.transfers.push({ id: makeId(), from, to, amountCents, createdAt: new Date().toISOString() });
  elements.transferAmount.value = '';
  render();
});

elements.transferList.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-remove-transfer]');
  if (!button) return;
  trip.transfers = trip.transfers.filter(({ id }) => id !== button.dataset.removeTransfer);
  render();
});

elements.clearTrip.addEventListener('click', () => {
  trip = newTrip();
  savedTrips.push(trip);
  activeTripId = trip.id;
  selectedPeople = new Set();
  customShares = {};
  elements.expenseForm.reset();
  elements.transferForm.reset();
  elements.personForm.reset();
  render();
});

render();
