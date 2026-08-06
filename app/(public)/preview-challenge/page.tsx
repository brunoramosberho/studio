import { notFound } from "next/navigation";
import PreviewClient from "./preview-client";

/**
 * A development-only gallery of every challenge-card state.
 *
 * It lives under `(public)`, which means without this gate it would be a real
 * page on every tenant's domain — a member could land on a fake challenge with
 * a working "Join" button. The mock data is the reason the page is useful and
 * exactly the reason it must never ship.
 */
export default function PreviewChallengePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PreviewClient />;
}
