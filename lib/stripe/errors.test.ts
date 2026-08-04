import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { isApplicationFeeUnsupportedError, isMissingCustomerError } from "./errors";

function invalidRequest(message: string, extra: Record<string, unknown> = {}) {
  return Stripe.errors.StripeInvalidRequestError.generate({
    type: "invalid_request_error",
    message,
    ...extra,
  });
}

describe("isApplicationFeeUnsupportedError", () => {
  it("matches the refusal Stripe actually returned", () => {
    // Verbatim from a live FDV checkout, 2026-08-03.
    const err = invalidRequest(
      "Stripe doesn't currently support application fees for platforms in ES with connected accounts in MX.",
    );
    expect(isApplicationFeeUnsupportedError(err)).toBe(true);
  });

  it("matches other country pairs, since the list isn't ours to track", () => {
    const err = invalidRequest(
      "Stripe doesn't currently support application fees for platforms in US with connected accounts in BR.",
    );
    expect(isApplicationFeeUnsupportedError(err)).toBe(true);
  });

  it("ignores unrelated Stripe failures, which must keep bubbling up", () => {
    expect(isApplicationFeeUnsupportedError(invalidRequest("Your card was declined."))).toBe(false);
    expect(
      isApplicationFeeUnsupportedError(
        invalidRequest("The application fee amount cannot be greater than the charge amount."),
      ),
    ).toBe(false);
  });

  it("ignores anything that isn't a Stripe error", () => {
    expect(isApplicationFeeUnsupportedError(new Error("boom"))).toBe(false);
    expect(isApplicationFeeUnsupportedError(null)).toBe(false);
  });
});

describe("isMissingCustomerError", () => {
  it("matches a deleted customer by param", () => {
    const err = invalidRequest("No such customer: 'cus_x'", {
      code: "resource_missing",
      param: "customer",
    });
    expect(isMissingCustomerError(err)).toBe(true);
  });

  it("does not match a different missing resource", () => {
    const err = invalidRequest("No such price: 'price_x'", {
      code: "resource_missing",
      param: "price",
    });
    expect(isMissingCustomerError(err)).toBe(false);
  });
});
