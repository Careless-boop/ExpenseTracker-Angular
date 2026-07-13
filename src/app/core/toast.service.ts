import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  text: string;
  kind: 'ok' | 'error';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private next = 1;

  ok(text: string): void {
    this.push(text, 'ok');
  }

  error(text: string): void {
    this.push(text, 'error');
  }

  dismiss(id: number): void {
    this.toasts.update((all) => all.filter((t) => t.id !== id));
  }

  private push(text: string, kind: Toast['kind']): void {
    const id = this.next++;
    this.toasts.update((all) => [...all, { id, text, kind }]);
    setTimeout(() => this.dismiss(id), kind === 'error' ? 7000 : 3500);
  }
}
