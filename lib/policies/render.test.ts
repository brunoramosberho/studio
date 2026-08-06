import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bookingClauses, type EventConsequence } from "./notice";
import { consequenceKey, noticeSentences } from "./render";

const catalogue = (locale: string) =>
  JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")).classDetail as Record<
    string,
    string
  >;

const money = (n: number) => `$${n}`;
/** Stands in for next-intl; returns the key so assertions can see which fired. */
const t = (key: string, values?: Record<string, string | number>) =>
  values?.fee ? `${key}(${values.fee})` : key;

/** Every consequence the model can produce. */
const CONSEQUENCES: EventConsequence[] = [
  { losesCredit: false, fee: null, feeVaries: false },
  { losesCredit: true, fee: null, feeVaries: false },
  { losesCredit: false, fee: 10, feeVaries: false },
  { losesCredit: false, fee: 10, feeVaries: true },
  { losesCredit: true, fee: 10, feeVaries: false },
  { losesCredit: true, fee: 10, feeVaries: true },
];

describe("every key the renderer can ask for exists", () => {
  // The renderer assembles key names, so a missing sentence would only surface
  // as a crash in front of a member. This is the check that keeps that honest.
  for (const locale of ["en", "es"]) {
    it(`${locale} has all consequence sentences`, () => {
      const messages = catalogue(locale);
      const missing: string[] = [];
      for (const scope of ["Both", "Late", "NoShow"] as const) {
        for (const c of CONSEQUENCES) {
          const key = consequenceKey(scope, c);
          if (!messages[key]) missing.push(key);
        }
      }
      expect(missing).toEqual([]);
    });

    it(`${locale} has every window sentence`, () => {
      const messages = catalogue(locale);
      for (const stake of ["", "NoCharge"]) {
        expect(messages[`policyWindow${stake}`]).toBeTruthy();
        expect(messages[`policyWindowAnytime${stake}`]).toBeTruthy();
      }
    });

    it(`${locale} interpolates a fee wherever one is named`, () => {
      const messages = catalogue(locale);
      for (const [key, text] of Object.entries(messages)) {
        if (!key.startsWith("policy")) continue;
        // Any sentence whose key promises a fee must have somewhere to put it.
        if (/Fee/.test(key)) expect(text).toContain("{fee}");
      }
    });
  }
});

describe("noticeSentences", () => {
  const pack = {
    windowHours: 12,
    isUnlimited: false,
    lateCancelFee: 0,
    noShowLosesCredit: true,
    noShowFee: 200,
  };

  it("splits the two events when they cost different things", () => {
    // FDV on a pack: cancelling late costs the credit, a no-show costs the
    // credit and $200. One combined sentence overcharged every late cancel.
    const out = noticeSentences(bookingClauses(pack), t, money);
    expect(out).toEqual(["policyWindow", "policyLateCredit", "policyNoShowCreditFee($200)"]);
  });

  it("uses one sentence when both events cost the same", () => {
    const out = noticeSentences(bookingClauses({ ...pack, noShowFee: 0 }), t, money);
    expect(out).toEqual(["policyWindow", "policyBothCredit"]);
  });

  it("switches the window sentence when there is no cut-off", () => {
    const out = noticeSentences(bookingClauses({ ...pack, windowHours: 0 }), t, money);
    expect(out[0]).toBe("policyWindowAnytime");
  });

  it("says nothing happens when nothing happens", () => {
    const out = noticeSentences(
      bookingClauses({
        windowHours: 6,
        isUnlimited: true,
        lateCancelFee: 0,
        noShowLosesCredit: true,
        noShowFee: 0,
      }),
      t,
      money,
    );
    expect(out).toEqual(["policyWindowNoCharge", "policyBothNone"]);
  });

  it("doesn't promise an unlimited member a credit they don't have", () => {
    const out = noticeSentences(
      bookingClauses({
        windowHours: 12,
        isUnlimited: true,
        lateCancelFee: 0,
        noShowLosesCredit: false,
        noShowFee: 15,
      }),
      t,
      money,
    );
    expect(out[0]).toBe("policyWindowNoCharge");
  });

  it("gives an unlimited member their two different fees", () => {
    // FDV Unlimited: $100 to cancel late, $200 for a no-show.
    const out = noticeSentences(
      bookingClauses({
        windowHours: 12,
        isUnlimited: true,
        lateCancelFee: 100,
        noShowLosesCredit: false,
        noShowFee: 200,
      }),
      t,
      money,
    );
    expect(out).toEqual([
      "policyWindowNoCharge",
      "policyLateFee($100)",
      "policyNoShowFee($200)",
    ]);
  });
});
