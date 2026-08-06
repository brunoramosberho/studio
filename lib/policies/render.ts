import { isFree, sameConsequence, type EventConsequence, type NoticeClauses } from "./notice";

/**
 * Turns policy clauses into finished sentences.
 *
 * Takes the translator and the money formatter as arguments so the same code
 * serves `useTranslations` in the browser and `getTranslations` in an email
 * worker. The member must read the same wording wherever they meet it.
 */

/** Matches both next-intl translator flavours. */
export type Translate = (key: string, values?: Record<string, string | number>) => string;

type Scope = "Both" | "Late" | "NoShow";

/**
 * Message keys are assembled rather than listed so a new consequence can't be
 * rendered without its sentence existing: every branch here has a key, and the
 * catalogue is checked against this function in the tests.
 */
export function consequenceKey(scope: Scope, c: EventConsequence): string {
  if (isFree(c)) return `policy${scope}None`;
  const hedge = c.feeVaries ? "UpTo" : "";
  if (c.losesCredit && c.fee != null) return `policy${scope}CreditFee${hedge}`;
  if (c.fee != null) return `policy${scope}Fee${hedge}`;
  return `policy${scope}Credit`;
}

export function noticeSentences(
  clauses: NoticeClauses,
  t: Translate,
  money: (amount: number) => string,
): string[] {
  // An unlimited member has no credit to keep, so promising they won't lose it
  // is a sentence about someone else's plan. Say what they actually keep.
  const stake = clauses.lateCancel.losesCredit ? "" : "NoCharge";
  const sentences: string[] = [
    clauses.windowHours > 0
      ? t(`policyWindow${stake}`, { hours: clauses.windowHours })
      : t(`policyWindowAnytime${stake}`),
  ];

  const say = (scope: Scope, c: EventConsequence) =>
    t(consequenceKey(scope, c), c.fee != null ? { fee: money(c.fee) } : undefined);

  // One sentence when both events cost the same — two identical ones read as a
  // mistake. Split only when they genuinely differ, which is the case that used
  // to be papered over.
  if (sameConsequence(clauses.lateCancel, clauses.noShow)) {
    sentences.push(say("Both", clauses.lateCancel));
  } else {
    sentences.push(say("Late", clauses.lateCancel));
    sentences.push(say("NoShow", clauses.noShow));
  }

  return sentences;
}
