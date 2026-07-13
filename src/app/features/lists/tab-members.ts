import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';

import { ExpenseListApi } from '../../core/api.service';
import { ApiError, toApiError } from '../../core/api-error';
import { longDate } from '../../core/format';
import { ExpenseListMember, ExpenseListRole } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ConfirmComponent, DialogComponent } from '../../shared/dialog';
import { AvatarComponent } from '../../shared/ui';
import { ListContext } from './list-context';

@Component({
  selector: 'app-tab-members',
  imports: [FormsModule, DialogComponent, ConfirmComponent, AvatarComponent],
  template: `
    <div class="panel__head">
      <div class="panel__title">Members</div>
      <div class="spacer"></div>
      @if (ctx.canManage()) {
        <button class="btn btn--sm btn--primary" type="button" (click)="adding.set(true)">
          ＋ Add member
        </button>
      }
      @if (ctx.canEdit()) {
        <button class="btn btn--sm" type="button" (click)="openMock(null)">
          ＋ Add placeholder
        </button>
      }
    </div>

    @for (m of ctx.members(); track m.memberId) {
      <div class="list-row">
        <app-avatar [name]="m.displayName" [isMock]="m.isMock" />

        <div class="list-row__main">
          <div class="row" style="gap:6px">
            <span class="list-row__title">{{ m.displayName }}</span>
            @if (isMe(m)) {
              <span class="badge badge--soft">You</span>
            }
            @if (m.isMock) {
              <span class="badge badge--placeholder">no account yet</span>
            }
          </div>
          <div class="list-row__meta">
            {{ m.email || 'Placeholder — an Editor records expenses on their behalf' }} · joined
            {{ date(m.joinedAt) }}
          </div>
        </div>

        <span [class]="'badge badge--' + m.role.toLowerCase()">{{ m.role }}</span>

        <div class="list-row__actions">
          @if (ctx.canEdit() && m.isMock) {
            <button class="icon-btn" type="button" title="Rename" (click)="openMock(m)">✎</button>
          }
          @if (ctx.canManage() && !isMe(m)) {
            <button class="icon-btn" type="button" title="Change role" (click)="openRole(m)">
              ⚙
            </button>
          }
          @if (canRemove(m)) {
            <button
              class="icon-btn icon-btn--danger"
              [title]="isMe(m) ? 'Leave list' : 'Remove'"
              type="button"
              (click)="removing.set(m)"
            >
              ✕
            </button>
          }
        </div>
      </div>
    }

    <!-- an owner cannot leave without transferring ownership first -->
    @if (ctx.isOwner() && !ctx.isClosed()) {
      <div class="panel__body" style="padding-top:0">
        <div class="hint">
          You own this list. To leave it, transfer ownership to another member first — promoting
          someone to Owner demotes you to Editor.
        </div>
      </div>
    }

    @if (adding()) {
      <app-dialog title="Add a member" size="sm" (closed)="adding.set(false)">
        <div class="callout callout--warn">
          You can only add someone who <strong>already has an account</strong>. There is no
          invite-by-email flow yet.
        </div>

        <div class="field">
          <label class="field__label">Their email</label>
          <input
            class="input"
            [class.is-invalid]="fieldError('email')"
            type="email"
            [ngModel]="email()"
            (ngModelChange)="email.set($event)"
            placeholder="friend@example.com"
          />
          @if (fieldError('email'); as msg) {
            <div class="field__error">{{ msg }}</div>
          }
        </div>

        <div class="field">
          <label class="field__label">Role</label>
          <!-- Owner is rejected here; transfer ownership via the role editor -->
          <div class="segmented">
            <button
              type="button"
              [class.is-active]="newRole() === 'Editor'"
              (click)="newRole.set('Editor')"
            >
              Editor
            </button>
            <button
              type="button"
              [class.is-active]="newRole() === 'Viewer'"
              (click)="newRole.set('Viewer')"
            >
              Viewer
            </button>
          </div>
          <div class="hint">
            Editors add transactions, categories and settlements. Viewers can only read.
          </div>
        </div>

        <div class="dialog__foot">
          <button class="btn" type="button" (click)="adding.set(false)">Cancel</button>
          <button
            class="btn btn--primary"
            type="button"
            [disabled]="busy() || !email().trim()"
            (click)="addMember()"
          >
            Add member
          </button>
        </div>
      </app-dialog>
    }

    @if (mockDialog()) {
      <app-dialog
        [title]="editingMock() ? 'Rename placeholder' : 'Add a placeholder'"
        size="sm"
        (closed)="closeMock()"
      >
        <div class="hint">
          A placeholder stands in for someone without an account. Editors record expenses and
          settlements on their behalf, and when they join they can claim it and inherit the history.
        </div>

        <div class="field">
          <label class="field__label">Display name</label>
          <input
            class="input"
            [class.is-invalid]="fieldError('displayName')"
            type="text"
            [ngModel]="displayName()"
            (ngModelChange)="displayName.set($event)"
            placeholder="Carol"
          />
          @if (fieldError('displayName'); as msg) {
            <div class="field__error">{{ msg }}</div>
          }
        </div>

        <div class="dialog__foot">
          <button class="btn" type="button" (click)="closeMock()">Cancel</button>
          <button
            class="btn btn--primary"
            type="button"
            [disabled]="busy() || !displayName().trim()"
            (click)="saveMock()"
          >
            {{ editingMock() ? 'Save name' : 'Add placeholder' }}
          </button>
        </div>
      </app-dialog>
    }

    @if (roleTarget(); as target) {
      <app-dialog title="Change role" size="sm" (closed)="roleTarget.set(null)">
        <div class="field">
          <label class="field__label">{{ target.displayName }}'s role</label>
          <div class="segmented">
            @for (r of roles; track r) {
              <button type="button" [class.is-active]="pendingRole() === r" (click)="pendingRole.set(r)">
                {{ r }}
              </button>
            }
          </div>
        </div>

        <!-- promoting to Owner is an ownership *transfer*: it demotes you -->
        @if (pendingRole() === 'Owner') {
          <div class="callout callout--warn">
            <strong>This transfers ownership.</strong> {{ target.displayName }} becomes the Owner and
            <strong>you are demoted to Editor</strong>. You will not be able to undo this yourself.
          </div>
        }

        <div class="dialog__foot">
          <button class="btn" type="button" (click)="roleTarget.set(null)">Cancel</button>
          <button
            class="btn"
            [class.btn--gold]="pendingRole() === 'Owner'"
            [class.btn--primary]="pendingRole() !== 'Owner'"
            type="button"
            [disabled]="busy() || pendingRole() === target.role"
            (click)="saveRole(target)"
          >
            {{ pendingRole() === 'Owner' ? 'Transfer ownership' : 'Save role' }}
          </button>
        </div>
      </app-dialog>
    }

    @if (removing(); as target) {
      <app-confirm
        [title]="isMe(target) ? 'Leave this list?' : 'Remove member'"
        [confirmLabel]="isMe(target) ? 'Leave list' : 'Remove member'"
        [busy]="busy()"
        (confirmed)="confirmRemove(target)"
        (cancelled)="removing.set(null)"
      >
        @if (isMe(target)) {
          You'll lose access to <strong>{{ ctx.detail()?.name }}</strong> and its history.
        } @else {
          Remove <strong>{{ target.displayName }}</strong> from this list?
        }
      </app-confirm>
    }
  `,
})
export class TabMembersComponent {
  protected readonly ctx = inject(ListContext);
  private readonly api = inject(ExpenseListApi);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly roles: ExpenseListRole[] = ['Viewer', 'Editor', 'Owner'];

  protected readonly adding = signal(false);
  protected readonly email = signal('');
  protected readonly newRole = signal<ExpenseListRole>('Editor');

  protected readonly mockDialog = signal(false);
  protected readonly editingMock = signal<ExpenseListMember | null>(null);
  protected readonly displayName = signal('');

  protected readonly roleTarget = signal<ExpenseListMember | null>(null);
  protected readonly pendingRole = signal<ExpenseListRole>('Editor');

  protected readonly removing = signal<ExpenseListMember | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<ApiError | null>(null);

  protected readonly date = longDate;

  protected isMe(m: ExpenseListMember): boolean {
    return this.ctx.me()?.memberId === m.memberId;
  }

  /** Owners may remove anyone; anyone may remove themselves ("leave"). */
  protected canRemove(m: ExpenseListMember): boolean {
    if (this.ctx.isClosed()) return false;
    if (this.isMe(m)) return !this.ctx.isOwner();
    return this.ctx.isOwner();
  }

  protected openMock(m: ExpenseListMember | null): void {
    this.error.set(null);
    this.editingMock.set(m);
    this.displayName.set(m?.displayName ?? '');
    this.mockDialog.set(true);
  }

  protected closeMock(): void {
    this.mockDialog.set(false);
    this.editingMock.set(null);
  }

  protected openRole(m: ExpenseListMember): void {
    this.error.set(null);
    this.roleTarget.set(m);
    this.pendingRole.set(m.role);
  }

  protected addMember(): void {
    this.busy.set(true);
    this.error.set(null);

    this.api.addMember(this.ctx.id(), this.email().trim(), this.newRole()).subscribe({
      next: () => {
        this.adding.set(false);
        this.email.set('');
        this.done('Member added.');
      },
      error: (err: unknown) => this.fail(err),
    });
  }

  protected saveMock(): void {
    this.busy.set(true);
    this.error.set(null);

    const target = this.editingMock();
    const name = this.displayName().trim();
    const request: Observable<unknown> = target
      ? this.api.updateMockMember(this.ctx.id(), target.memberId, name)
      : this.api.addMockMember(this.ctx.id(), name);

    request.subscribe({
      next: () => {
        this.closeMock();
        this.done(target ? 'Placeholder renamed.' : 'Placeholder added.');
      },
      error: (err: unknown) => this.fail(err),
    });
  }

  protected saveRole(target: ExpenseListMember): void {
    this.busy.set(true);
    this.error.set(null);

    this.api.updateMemberRole(this.ctx.id(), target.memberId, this.pendingRole()).subscribe({
      next: () => {
        const transferred = this.pendingRole() === 'Owner';
        this.roleTarget.set(null);
        this.done(
          transferred
            ? `${target.displayName} is now the owner. You are an Editor.`
            : 'Role updated.',
        );
      },
      error: (err: unknown) => this.fail(err),
    });
  }

  protected confirmRemove(target: ExpenseListMember): void {
    this.busy.set(true);

    this.api.removeMember(this.ctx.id(), target.memberId).subscribe({
      next: () => {
        this.busy.set(false);
        this.removing.set(null);

        if (this.isMe(target)) {
          this.toasts.ok('You left the list.');
          void this.router.navigate(['/lists']);
          return;
        }
        this.toasts.ok('Member removed.');
        this.ctx.refresh();
      },
      error: (err: unknown) => {
        this.removing.set(null);
        this.fail(err);
      },
    });
  }

  private done(message: string): void {
    this.busy.set(false);
    this.toasts.ok(message);
    this.ctx.refresh();
  }

  private fail(err: unknown): void {
    this.busy.set(false);
    const apiError = toApiError(err);
    this.error.set(apiError);
    if (!Object.keys(apiError.fieldErrors).length) {
      this.toasts.error(apiError.message);
    }
  }

  protected fieldError(field: string): string | null {
    return this.error()?.fieldErrors[field]?.[0] ?? null;
  }
}
