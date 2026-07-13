/**
 * Client-side port of ExpenseListTransaction.CalculateShares and
 * ParticipantSplitRules.SharesReconcile on the server.
 *
 * The split editor must preview the *real* per-person numbers and block submit
 * until the split reconciles, otherwise a naive form produces constant 400s. So
 * the two rules have to agree with the server exactly:
 *
 *   - Participants are ordered by member id and the rounding remainder (the odd
 *     cent of e.g. 10.01 / 3) lands on the first one. Ordinal string order over
 *     canonical lowercase GUIDs matches .NET's Guid comparison, which compares
 *     each hex group as an unsigned number.
 *   - All arithmetic runs in integer cents; binary floats would drift off the
 *     server's decimal maths.
 */

export interface SplitParticipant {
  memberId: string;
  /** null = take an equal share of whatever is left. */
  customShareAmount: number | null;
}

export type SplitState = 'ok' | 'over' | 'short';

export interface SplitResult {
  state: SplitState;
  /** memberId → share, only when the split reconciles. */
  shares: Record<string, number>;
  customTotal: number;
  /** Left to divide among the equal-share participants (0 when all are custom). */
  remaining: number;
  /** How far the custom shares overshoot the total; 0 unless state is 'over'. */
  over: number;
  equalCount: number;
}

const cents = (n: number): number => Math.round((n || 0) * 100);
const toMoney = (c: number): number => c / 100;

function byMemberId(a: SplitParticipant, b: SplitParticipant): number {
  const x = a.memberId.toLowerCase();
  const y = b.memberId.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

export function calculateSplit(participants: SplitParticipant[], amount: number): SplitResult {
  const total = cents(amount);
  const ordered = [...participants].sort(byMemberId);
  const custom = ordered.filter((p) => p.customShareAmount !== null);
  const equal = ordered.filter((p) => p.customShareAmount === null);
  const customTotal = custom.reduce((sum, p) => sum + cents(p.customShareAmount!), 0);

  const shares: Record<string, number> = {};
  const base: SplitResult = {
    state: 'ok',
    shares,
    customTotal: toMoney(customTotal),
    remaining: toMoney(total - customTotal),
    over: 0,
    equalCount: equal.length,
  };

  if (!ordered.length) {
    // No participants selected = "everyone, equally" on the server.
    return { ...base, remaining: toMoney(total) };
  }

  // Every participant is custom: they must account for exactly the total.
  if (equal.length === 0) {
    if (customTotal !== total) {
      const over = customTotal - total;
      return {
        ...base,
        state: over > 0 ? 'over' : 'short',
        over: toMoney(Math.max(over, 0)),
        remaining: toMoney(total - customTotal),
      };
    }
    for (const p of custom) {
      shares[p.memberId] = p.customShareAmount!;
    }
    return { ...base, remaining: 0 };
  }

  // Mixed: the customs must leave something over for the equal shares to divide.
  if (custom.length > 0 && customTotal >= total) {
    return {
      ...base,
      state: 'over',
      over: toMoney(customTotal - total),
      remaining: toMoney(total - customTotal),
    };
  }

  for (const p of custom) {
    shares[p.memberId] = p.customShareAmount!;
  }

  const remainingCents = total - customTotal;
  const equalShare = Math.floor(remainingCents / equal.length);
  const remainder = remainingCents - equalShare * equal.length;

  equal.forEach((p, i) => {
    shares[p.memberId] = toMoney(i === 0 ? equalShare + remainder : equalShare);
  });

  return { ...base, remaining: toMoney(remainingCents) };
}
