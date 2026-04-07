"use client";

import { useEffect, useRef } from "react";
import type {
  NudgeDecision,
  BookingFlowData,
  IntroOfferData,
  PackageUpgradeData,
} from "@/lib/conversion/nudge-engine";
import { BookingFlowOptions } from "./BookingFlowOptions";
import { IntroOfferCard } from "./IntroOfferCard";
import { PackageUpgradeCard } from "./PackageUpgradeCard";

function useTrackNudgeShown(nudgeType: string | null) {
  const tracked = useRef(false);
  useEffect(() => {
    if (!nudgeType || tracked.current) return;
    tracked.current = true;
    fetch("/api/conversion/nudge/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nudgeType, event: "shown" }),
    }).catch(() => {});
  }, [nudgeType]);
}

interface MembershipNudgeProps {
  decision: NudgeDecision;
  classPrice?: number;
  onMembershipActivated: () => void;
  onSingleClass: () => void;
}

export function MembershipNudge({
  decision,
  classPrice,
  onMembershipActivated,
  onSingleClass,
}: MembershipNudgeProps) {
  useTrackNudgeShown(
    decision.type === "none" ? null : decision.type,
  );

  if (decision.type === "none") return null;

  if (decision.type === "booking_flow") {
    return (
      <BookingFlowOptions
        data={decision.data}
        classPrice={classPrice ?? 0}
        onSelect={(option) => {
          if (option === "single") {
            onSingleClass();
          } else {
            onMembershipActivated();
          }
        }}
        onContinue={onSingleClass}
      />
    );
  }

  if (decision.type === "intro_offer") {
    return (
      <IntroOfferCard
        data={decision.data}
        onAccept={onMembershipActivated}
        onReject={onSingleClass}
      />
    );
  }

  if (decision.type === "package_upgrade") {
    return (
      <PackageUpgradeCard data={decision.data} onContinue={onMembershipActivated} />
    );
  }

  return null;
}
