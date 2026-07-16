import { ExpenseListRole, TransactionType } from './models';

/**
 * Currency is a display attribute — amounts are bare decimals and nothing is
 * converted. The personal ledger uses the user's currency; each expense list
 * uses its own. Formatters are cached per code so we don't rebuild them per row.
 */
const FORMATTERS = new Map<string, Intl.NumberFormat>();

function formatter(currency: string): Intl.NumberFormat {
  let f = FORMATTERS.get(currency);
  if (!f) {
    f = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      // narrowSymbol renders ₴ / £ / ₪ rather than the ISO code, matching our pickers.
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    FORMATTERS.set(currency, f);
  }
  return f;
}

export function money(amount: number, currency = 'USD'): string {
  return formatter(currency).format(Math.abs(amount ?? 0));
}

/** "+$120.00" / "−$187.40" — the design leans on the sign to read type at a glance. */
export function signedMoney(amount: number, type: TransactionType, currency = 'USD'): string {
  return `${type === 'Income' ? '+' : '−'}${money(amount, currency)}`;
}

export function signedBalance(balance: number, currency = 'USD'): string {
  if (balance === 0) return money(0, currency);
  return `${balance > 0 ? '+' : '−'}${money(balance, currency)}`;
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/** The API binds DateTime from query/body; send a date-only ISO string. */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dateInputValue(iso: string): string {
  return toIsoDate(new Date(iso));
}

export function initials(name: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic avatar colour so a member keeps the same one across screens. */
const AVATAR_COLORS = [
  ['#c8f2b8', '#2e9a2e'],
  ['#b8e3ff', '#2380dd'],
  ['#c495dd', '#8e44ad'],
  ['#ffd9a8', '#e67e22'],
  ['#a8e6da', '#16a085'],
  ['#ffc9b8', '#d6472b'],
];

export function avatarGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < (seed ?? '').length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const [from, to] = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  return `linear-gradient(180deg, ${from}, ${to})`;
}

/** Categories carry a user-chosen hex colour — use it rather than a palette of our own. */
export function categoryGradient(color: string | null | undefined): string {
  const base = color && /^#[0-9a-f]{6}$/i.test(color) ? color : '#95a5a6';
  return `linear-gradient(180deg, ${lighten(base, 0.28)}, ${base})`;
}

function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) + 255 * amount));
  const g = Math.min(255, Math.round(((n >> 8) & 255) + 255 * amount));
  const b = Math.min(255, Math.round((n & 255) + 255 * amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function roleBadgeClass(role: ExpenseListRole): string {
  return `badge badge--${role.toLowerCase()}`;
}

export function canEdit(role: ExpenseListRole): boolean {
  return role === 'Editor' || role === 'Owner';
}

export function isOwner(role: ExpenseListRole): boolean {
  return role === 'Owner';
}
