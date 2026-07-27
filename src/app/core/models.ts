/**
 * Mirrors the DTOs in ExpenseTracker.Application. The API serialises enums as
 * strings (JsonStringEnumConverter) and property names as camelCase.
 */

export type TransactionType = 'Expense' | 'Income';
export type ExpenseListRole = 'Viewer' | 'Editor' | 'Owner';

export interface User {
  id: string;
  userName: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: User;
}

export interface Paginated<T> {
  items: T[];
  pageNumber: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

/* ---------- Dashboard ----------------------------------------------------- */

export interface PeriodTotals {
  totalIncome: number;
  totalExpenses: number;
  net: number;
  transactionCount: number;
}

export interface DashboardSummary {
  from: string;
  to: string;
  current: PeriodTotals;
  previous: PeriodTotals;
  /** null when the previous period's net was zero — the change is undefined. */
  netChangePercent: number | null;
}

export interface CategoryBreakdownItem {
  categoryId: string;
  name: string;
  icon: string | null;
  color: string | null;
  total: number;
  percentage: number;
  transactionCount: number;
}

export interface CategoryBreakdown {
  from: string;
  to: string;
  total: number;
  categories: CategoryBreakdownItem[];
}

/* ---------- Personal ledger ----------------------------------------------- */

export interface PersonalCategory {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  isDefault: boolean;
  transactionCount: number;
}

export interface PersonalTransaction {
  id: string;
  amount: number;
  description: string | null;
  date: string;
  type: TransactionType;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  createdAt: string;
}

export interface TransactionFilters {
  categoryId?: string | null;
  type?: TransactionType | null;
  fromDate?: string | null;
  toDate?: string | null;
  pageNumber?: number;
  pageSize?: number;
}

/* ---------- Expense lists ------------------------------------------------- */

export interface ExpenseList {
  id: string;
  name: string;
  description: string | null;
  coverImage: string | null;
  currency: string;
  memberCount: number;
  transactionCount: number;
  currentUserRole: ExpenseListRole;
  createdAt: string;
  closedAt: string | null;
}

export interface ExpenseListMember {
  memberId: string;
  displayName: string;
  userId: string | null;
  email: string | null;
  role: ExpenseListRole;
  joinedAt: string;
  isMock: boolean;
}

export interface ExpenseListDetail {
  id: string;
  name: string;
  description: string | null;
  coverImage: string | null;
  currency: string;
  members: ExpenseListMember[];
  transactionCount: number;
  totalExpenses: number;
  totalIncome: number;
  currentUserRole: ExpenseListRole;
  createdAt: string;
  closedAt: string | null;
}

export interface ExpenseListCategory {
  id: string;
  expenseListId: string;
  name: string;
  icon: string | null;
  color: string | null;
  isDefault: boolean;
  transactionCount: number;
}

export interface ExpenseListParticipant {
  memberId: string;
  displayName: string;
  customShareAmount: number | null;
  calculatedShare: number;
}

export interface ExpenseListTransaction {
  id: string;
  expenseListId: string;
  amount: number;
  description: string | null;
  date: string;
  type: TransactionType;
  paidByMemberId: string;
  paidByDisplayName: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  createdAt: string;
  participants: ExpenseListParticipant[];
  calculatedShares: Record<string, number>;
  /** Custom shares are contributions; the leftover was divided equally among everyone. */
  splitRemainder: boolean;
}

/** What the API accepts for a participant: a null share means "split equally". */
export interface ParticipantInput {
  memberId: string;
  customShareAmount: number | null;
}

export interface SaveListTransaction {
  amount: number;
  description: string | null;
  date: string;
  type: TransactionType;
  paidByMemberId: string;
  categoryId: string | null;
  participants: ParticipantInput[] | null;
  splitRemainder: boolean;
}

/* ---------- Balances & settlements ---------------------------------------- */

export interface MemberBalance {
  memberId: string;
  displayName: string;
  isMock: boolean;
  /** > 0 is owed money, < 0 owes money. Always sums to zero across members. */
  balance: number;
  totalPaid: number;
  totalShare: number;
}

export interface Debt {
  fromMemberId: string;
  fromDisplayName: string;
  toMemberId: string;
  toDisplayName: string;
  amount: number;
}

export interface ExpenseListBalances {
  expenseListId: string;
  expenseListName: string;
  memberBalances: MemberBalance[];
  simplifiedDebts: Debt[];
  totalExpenses: number;
  totalIncome: number;
}

export interface Settlement {
  id: string;
  expenseListId: string;
  fromMemberId: string;
  fromDisplayName: string;
  toMemberId: string;
  toDisplayName: string;
  amount: number;
  settledAt: string;
  note: string | null;
  createdAt: string;
}

/* ---------- Settings ------------------------------------------------------ */

export interface UserSettings {
  syncClosedListsToPersonal: boolean;
  currency: string;
}
