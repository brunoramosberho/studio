"use client";

import type {
  NudgeDecision,
  BookingFlowData,
  IntroOfferData,
  PackageUpgradeData,
} from "@/lib/conversion/nudge-engine";
import { BookingFlowOptions } from "./BookingFlowOptions";
import { IntroOfferCard } from "./IntroOfferCard";
import { PackageUpgradeCard } from "./PackageUpgradeCard";

interface MembershipNudgeProps {
  decision: NudgeDecision;
  classPrice?: number;
  onContinue: () => void;
}

export function MembershipNudge({
  decision,
  classPrice,
  onContinue,
}: MembershipNudgeProps) {
  if (decision.type === "none") return null;

  if (decision.type === "booking_flow") {
    return (
      <BookingFlowOptions
        data={decision.data}
        classPrice={classPrice ?? 0}
        onSelect={(option) => {
          if (option === "single") {
            onContinue();
          }
        }}
        onContinue={onContinue}
      />
    );
  }

  if (decision.type === "intro_offer") {
    return (
      <IntroOfferCard
        data={decision.data}
        onAccept={() => {}}
        onReject={onContinue}
      />
    );
  }

  if (decision.type === "package_upgrade") {
    return (
      <PackageUpgradeCard data={decision.data} onContinue={onContinue} />
    );
  }

  return null;
}
