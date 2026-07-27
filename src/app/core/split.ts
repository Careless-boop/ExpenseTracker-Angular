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

/**
 * ok      — reconciles, submit allowed (green)
 * partial — every share is custom and they fall short, but the shortfall is being
 *           divided between them; submit allowed (yellow)
 * short   — every share is custom and they fall short with no rule for the rest (red)
 * over    — custom shares exceed the total (red)
 */
export type SplitState = 'ok' | 'partial' | 'short' | 'over';

export interface SplitResult {
  state: SplitState;
  /** memberId → final share, whenever the split is submittable. */
  shares: Record<string, number>;
  /** memberId → the equal slice added on top of a custom share when "split the rest" is on. */
  extras: Record<string, number>;
  customTotal: number;
  /** Left to divide (negative when over-allocated). */
  remaining: number;
  over: number;
  equalCount: number;
  /** True when every participant carries a custom amount. */
  allCustom: boolean;
  /** True when at least one participant carries a custom amount — the flag only applies then. */
  hasCustom: boolean;
}

const cents = (n: number): number => Math.round((n || 0) * 100);
const toMoney = (c: number): number => c / 100;

function byMemberId(a: SplitParticipant, b: SplitParticipant): number {
  const x = a.memberId.toLowerCase();
  const y = b.memberId.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Divide `totalCents` equally, giving the odd cent to the first member. */
function spread(members: SplitParticipant[], totalCents: number): Record<string, number> {
  const each = Math.floor(totalCents / members.length);
  const odd = totalCents - each * members.length;

  const out: Record<string, number> = {};
  members.forEach((p, i) => {
    out[p.memberId] = toMoney(i === 0 ? each + odd : each);
  });
  return out;
}

export function calculateSplit(
  participants: SplitParticipant[],
  amount: number,
  splitRemainder = false,
): SplitResult {
  const total = cents(amount);
  const ordered = [...participants].sort(byMemberId);
  const custom = ordered.filter((p) => p.customShareAmount !== null);
  const equal = ordered.filter((p) => p.customShareAmount === null);
  const customTotal = custom.reduce((sum, p) => sum + cents(p.customShareAmount!), 0);

  const shares: Record<string, number> = {};
  const extras: Record<string, number> = {};
  const base: SplitResult = {
    state: 'ok',
    shares,
    extras,
    customTotal: toMoney(customTotal),
    remaining: toMoney(total - customTotal),
    over: 0,
    equalCount: equal.length,
    allCustom: ordered.length > 0 && equal.length === 0,
    hasCustom: custom.length > 0,
  };

  if (!ordered.length) {
    // No participants selected = "everyone, equally" on the server.
    return { ...base, remaining: toMoney(total) };
  }

  if (equal.length === 0) {
    if (customTotal > total) {
      return { ...base, state: 'over', over: toMoney(customTotal - total) };
    }

    for (const p of custom) {
      shares[p.memberId] = p.customShareAmount!;
    }

    const shortfall = total - customTotal;
    if (shortfall === 0) {
      return base;
    }

    // Every share is custom and they fall short: only the flag makes that legal.
    if (!splitRemainder) {
      return { ...base, state: 'short', shares: {} };
    }

    const perHead = spread(custom, shortfall);
    for (const p of custom) {
      extras[p.memberId] = perHead[p.memberId];
      shares[p.memberId] = toMoney(cents(p.customShareAmount!) + cents(perHead[p.memberId]));
    }
    return { ...base, state: 'partial' };
  }

  // Mixed: at least one custom and at least one equal. The customs must leave something over —
  // the mixed rule (customTotal < total, strictly) is unchanged by the flag.
  if (customTotal >= total) {
    return { ...base, state: 'over', over: toMoney(customTotal - total), shares: {} };
  }

  for (const p of custom) {
    shares[p.memberId] = p.customShareAmount!;
  }

  // "Split the rest": the leftover is divided among *everyone*, so a custom participant pays their
  // contribution plus an equal slice (the equal ones act as a custom share of 0). Unchecked, only
  // the equal participants divide it and the customs pay exactly their amount.
  const sharing = splitRemainder ? ordered : equal;
  const perHead = spread(sharing, total - customTotal);

  for (const p of sharing) {
    if (p.customShareAmount !== null) {
      extras[p.memberId] = perHead[p.memberId];
      shares[p.memberId] = toMoney(cents(p.customShareAmount) + cents(perHead[p.memberId]));
    } else {
      shares[p.memberId] = perHead[p.memberId];
    }
  }

  return base;
}
