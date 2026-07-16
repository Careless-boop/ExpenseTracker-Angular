import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API } from './api.config';
import {
  CategoryBreakdown,
  DashboardSummary,
  ExpenseList,
  ExpenseListBalances,
  ExpenseListCategory,
  ExpenseListDetail,
  ExpenseListRole,
  ExpenseListTransaction,
  Paginated,
  PersonalCategory,
  PersonalTransaction,
  SaveListTransaction,
  Settlement,
  TransactionFilters,
  TransactionType,
  UserSettings,
} from './models';

interface CreatedId {
  id: string;
}

interface CreatedMember {
  memberId: string;
}

function filterParams(f: TransactionFilters): HttpParams {
  let params = new HttpParams()
    .set('pageNumber', f.pageNumber ?? 1)
    .set('pageSize', f.pageSize ?? 20);

  if (f.categoryId) params = params.set('categoryId', f.categoryId);
  if (f.type) params = params.set('type', f.type);
  if (f.fromDate) params = params.set('fromDate', f.fromDate);
  if (f.toDate) params = params.set('toDate', f.toDate);
  return params;
}

function periodParams(from?: string | null, to?: string | null): HttpParams {
  let params = new HttpParams();
  if (from) params = params.set('from', from);
  if (to) params = params.set('to', to);
  return params;
}

@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private readonly http = inject(HttpClient);

  summary(from?: string | null, to?: string | null): Observable<DashboardSummary> {
    return this.http.get<DashboardSummary>(`${API}/dashboard/summary`, {
      params: periodParams(from, to),
    });
  }

  byCategory(
    from?: string | null,
    to?: string | null,
    type: TransactionType = 'Expense',
  ): Observable<CategoryBreakdown> {
    return this.http.get<CategoryBreakdown>(`${API}/dashboard/by-category`, {
      params: periodParams(from, to).set('type', type),
    });
  }
}

@Injectable({ providedIn: 'root' })
export class PersonalApi {
  private readonly http = inject(HttpClient);

  transactions(filters: TransactionFilters): Observable<Paginated<PersonalTransaction>> {
    return this.http.get<Paginated<PersonalTransaction>>(`${API}/personal/transactions`, {
      params: filterParams(filters),
    });
  }

  createTransaction(body: {
    amount: number;
    description: string | null;
    date: string;
    type: TransactionType;
    categoryId: string | null;
  }): Observable<CreatedId> {
    return this.http.post<CreatedId>(`${API}/personal/transactions`, body);
  }

  updateTransaction(
    id: string,
    body: {
      amount: number;
      description: string | null;
      date: string;
      type: TransactionType;
      categoryId: string | null;
    },
  ): Observable<void> {
    return this.http.put<void>(`${API}/personal/transactions/${id}`, { id, ...body });
  }

  deleteTransaction(id: string): Observable<void> {
    return this.http.delete<void>(`${API}/personal/transactions/${id}`);
  }

  categories(): Observable<PersonalCategory[]> {
    return this.http.get<PersonalCategory[]>(`${API}/personal/categories`);
  }

  createCategory(body: {
    name: string;
    icon: string | null;
    color: string | null;
  }): Observable<CreatedId> {
    return this.http.post<CreatedId>(`${API}/personal/categories`, body);
  }

  updateCategory(
    id: string,
    body: { name: string; icon: string | null; color: string | null },
  ): Observable<void> {
    return this.http.put<void>(`${API}/personal/categories/${id}`, { id, ...body });
  }

  /** Without a reassign target the transactions fall back to the default category. */
  deleteCategory(id: string, reassignToCategoryId?: string | null): Observable<void> {
    let params = new HttpParams();
    if (reassignToCategoryId) params = params.set('reassignToCategoryId', reassignToCategoryId);
    return this.http.delete<void>(`${API}/personal/categories/${id}`, { params });
  }
}

@Injectable({ providedIn: 'root' })
export class ExpenseListApi {
  private readonly http = inject(HttpClient);

  all(): Observable<ExpenseList[]> {
    return this.http.get<ExpenseList[]>(`${API}/expense-lists`);
  }

  byId(id: string): Observable<ExpenseListDetail> {
    return this.http.get<ExpenseListDetail>(`${API}/expense-lists/${id}`);
  }

  balances(id: string): Observable<ExpenseListBalances> {
    return this.http.get<ExpenseListBalances>(`${API}/expense-lists/${id}/balances`);
  }

  create(body: {
    name: string;
    description: string | null;
    coverImage: string | null;
    currency: string;
  }): Observable<CreatedId> {
    return this.http.post<CreatedId>(`${API}/expense-lists`, body);
  }

  update(
    id: string,
    body: { name: string; description: string | null; coverImage: string | null; currency: string },
  ): Observable<void> {
    return this.http.put<void>(`${API}/expense-lists/${id}`, { id, ...body });
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${API}/expense-lists/${id}`);
  }

  close(id: string): Observable<void> {
    return this.http.post<void>(`${API}/expense-lists/${id}/close`, {});
  }

  reopen(id: string): Observable<void> {
    return this.http.post<void>(`${API}/expense-lists/${id}/reopen`, {});
  }

  /** The person must already have an account; an unknown email is a 400. */
  addMember(id: string, email: string, role: ExpenseListRole): Observable<CreatedMember> {
    return this.http.post<CreatedMember>(`${API}/expense-lists/${id}/members`, { email, role });
  }

  updateMemberRole(id: string, memberId: string, role: ExpenseListRole): Observable<void> {
    return this.http.put<void>(`${API}/expense-lists/${id}/members/${memberId}`, { role });
  }

  removeMember(id: string, memberId: string): Observable<void> {
    return this.http.delete<void>(`${API}/expense-lists/${id}/members/${memberId}`);
  }

  addMockMember(id: string, displayName: string): Observable<CreatedMember> {
    return this.http.post<CreatedMember>(`${API}/expense-lists/${id}/mock-members`, {
      displayName,
    });
  }

  updateMockMember(id: string, memberId: string, displayName: string): Observable<void> {
    return this.http.put<void>(`${API}/expense-lists/${id}/mock-members/${memberId}`, {
      displayName,
    });
  }

  /** Fold your membership into a placeholder and inherit its history. */
  claim(id: string, mockMemberId: string): Observable<void> {
    return this.http.post<void>(`${API}/expense-lists/${id}/claim/${mockMemberId}`, {});
  }

  transactions(
    id: string,
    filters: TransactionFilters,
  ): Observable<Paginated<ExpenseListTransaction>> {
    return this.http.get<Paginated<ExpenseListTransaction>>(
      `${API}/expense-lists/${id}/transactions`,
      { params: filterParams(filters) },
    );
  }

  createTransaction(id: string, body: SaveListTransaction): Observable<CreatedId> {
    return this.http.post<CreatedId>(`${API}/expense-lists/${id}/transactions`, body);
  }

  updateTransaction(id: string, txId: string, body: SaveListTransaction): Observable<void> {
    return this.http.put<void>(`${API}/expense-lists/${id}/transactions/${txId}`, {
      id: txId,
      ...body,
    });
  }

  deleteTransaction(id: string, txId: string): Observable<void> {
    return this.http.delete<void>(`${API}/expense-lists/${id}/transactions/${txId}`);
  }

  categories(id: string): Observable<ExpenseListCategory[]> {
    return this.http.get<ExpenseListCategory[]>(`${API}/expense-lists/${id}/categories`);
  }

  createCategory(
    id: string,
    body: { name: string; icon: string | null; color: string | null },
  ): Observable<CreatedId> {
    return this.http.post<CreatedId>(`${API}/expense-lists/${id}/categories`, body);
  }

  updateCategory(
    id: string,
    categoryId: string,
    body: { name: string; icon: string | null; color: string | null },
  ): Observable<void> {
    return this.http.put<void>(`${API}/expense-lists/${id}/categories/${categoryId}`, body);
  }

  deleteCategory(
    id: string,
    categoryId: string,
    reassignToCategoryId?: string | null,
  ): Observable<void> {
    let params = new HttpParams();
    if (reassignToCategoryId) params = params.set('reassignToCategoryId', reassignToCategoryId);
    return this.http.delete<void>(`${API}/expense-lists/${id}/categories/${categoryId}`, {
      params,
    });
  }

  settlements(
    id: string,
    pageNumber = 1,
    pageSize = 20,
  ): Observable<Paginated<Settlement>> {
    return this.http.get<Paginated<Settlement>>(`${API}/expense-lists/${id}/settlements`, {
      params: new HttpParams().set('pageNumber', pageNumber).set('pageSize', pageSize),
    });
  }

  /** fromMemberId defaults to you and may only name a *mock* member. */
  createSettlement(
    id: string,
    body: {
      toMemberId: string;
      amount: number;
      note: string | null;
      fromMemberId: string | null;
    },
  ): Observable<CreatedId> {
    return this.http.post<CreatedId>(`${API}/expense-lists/${id}/settlements`, body);
  }

  deleteSettlement(id: string, settlementId: string): Observable<void> {
    return this.http.delete<void>(`${API}/expense-lists/${id}/settlements/${settlementId}`);
  }
}


@Injectable({ providedIn: 'root' })
export class SettingsApi {
  private readonly http = inject(HttpClient);

  get(): Observable<UserSettings> {
    return this.http.get<UserSettings>(`${API}/settings`);
  }

  update(settings: UserSettings): Observable<UserSettings> {
    return this.http.put<UserSettings>(`${API}/settings`, settings);
  }
}
