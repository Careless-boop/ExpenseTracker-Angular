import { Injectable, computed, inject, signal } from '@angular/core';

import { ExpenseListApi } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ExpenseListDetail, ExpenseListMember } from '../../core/models';

/**
 * Shared by the detail shell and every tab under it, so a write in one tab
 * (adding a member, closing the list) refreshes the header and the others.
 * Provided per-route, not in root.
 */
@Injectable()
export class ListContext {
  private readonly api = inject(ExpenseListApi);
  private readonly auth = inject(AuthService);

  readonly id = signal<string>('');
  readonly detail = signal<ExpenseListDetail | null>(null);
  readonly loading = signal(true);
  /** 404 covers both "missing" and "you're not a member" — the copy must fit both. */
  readonly notFound = signal(false);

  readonly members = computed(() => this.detail()?.members ?? []);
  readonly role = computed(() => this.detail()?.currentUserRole ?? 'Viewer');
  readonly isClosed = computed(() => !!this.detail()?.closedAt);
  readonly isOwner = computed(() => this.role() === 'Owner');
  /** Each list has its own currency; amounts here are shown in it. */
  readonly currency = computed(() => this.detail()?.currency ?? 'USD');

  /** A closed list rejects every write, so writes are gated on open + role. */
  readonly canEdit = computed(
    () => !this.isClosed() && (this.role() === 'Editor' || this.role() === 'Owner'),
  );
  readonly canManage = computed(() => !this.isClosed() && this.isOwner());

  readonly me = computed<ExpenseListMember | null>(() => {
    const userId = this.auth.user()?.id;
    return this.members().find((m) => m.userId === userId) ?? null;
  });

  readonly mockMembers = computed(() => this.members().filter((m) => m.isMock));

  /**
   * The claim flow: an owner adds you by email, you land here with an empty
   * history, and you claim the placeholder that is you.
   */
  readonly claimable = computed(() => (this.me() ? this.mockMembers() : []));

  load(id: string): void {
    this.id.set(id);
    this.loading.set(true);
    this.notFound.set(false);

    this.api.byId(id).subscribe({
      next: (detail) => {
        this.detail.set(detail);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.notFound.set(true);
      },
    });
  }

  refresh(): void {
    if (this.id()) {
      this.api.byId(this.id()).subscribe({
        next: (detail) => this.detail.set(detail),
      });
    }
  }

  memberName(memberId: string): string {
    return this.members().find((m) => m.memberId === memberId)?.displayName ?? 'Unknown';
  }
}
