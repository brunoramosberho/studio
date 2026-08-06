"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, PartyPopper } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const WELLHUB_PINK = "#F2496B";

export interface WellhubLinkStatus {
  enabled: boolean;
  linked: boolean;
  email?: string | null;
  wellhubName?: string | null;
  linkedAt?: string | null;
  linkedVia?: string | null;
  attendedCount?: number;
  claimPending?: boolean;
  claimEmail?: string | null;
}

export const WELLHUB_LINK_QUERY_KEY = ["wellhub", "link"] as const;

export async function fetchWellhubLinkStatus(): Promise<WellhubLinkStatus> {
  const res = await fetch("/api/wellhub/link");
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

/**
 * The "welly" spark from the official Wellhub wordmark (the symbol that closes
 * the logo), extracted from wellhub.com. Brand color #F2496B.
 */
export function WellhubMark({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg className={className} style={style} viewBox="878 0 218 214" fill="currentColor" aria-hidden="true">
      <path d="M983.02 86.5199C975.99 70.0999 942.35 57.7599 917.01 57.7599C895.51 57.7599 880.81 65.23 880.81 81.42C880.81 93.99 891.88 102.73 901.03 102.73C921.05 102.73 932.54 83.3399 958.31 83.3399C967.47 83.3399 975.13 87.3799 975.13 93.3599C975.13 95.9199 973.42 97.8299 970.87 97.8299C968.74 97.8299 967.16 96.7599 963.2 96.7599C937.22 96.7599 893.78 133.84 893.78 157.07C893.78 168.58 902.94 178.38 914.65 178.38C922.53 178.38 930.2 174.12 933.61 166.65C941.49 151.09 937.24 143.64 948.72 119.14C952.56 111.04 959.36 106.57 964.68 106.57C968.09 106.57 970.65 108.7 970.65 111.48C970.65 117.87 954.89 118.09 954.89 150.9C954.89 174.56 961.28 213.55 984.92 213.55C996.41 213.55 1005.37 203.97 1005.37 192.67C1005.37 189.47 1004.73 186.28 1003.44 183.5C996.2 167.73 984.48 164.97 972.99 140.23C971.51 137.04 970.65 133.84 970.65 130.85C970.65 124.88 972.99 121.68 977.47 121.68C980.25 121.68 982.16 123.6 982.16 126.37C982.16 153.44 1034.11 181.13 1055.84 181.13C1067.76 181.13 1077.56 171.96 1077.56 160.67C1077.56 148.74 1067.77 138.93 1055.41 138.93C1044.12 138.93 1036.45 140.21 1026.66 140.21C1015.17 140.21 991.95 140.43 991.95 126.79C991.95 123.16 994.73 121.68 996.42 121.68C1002.16 121.68 1001.53 129.56 1023.89 129.56C1047.95 129.56 1093.73 109.74 1093.73 85.2299C1093.73 73.5 1084.14 63.92 1072.86 63.92C1068.17 63.92 1063.7 65.6199 1059.87 68.6099C1046.45 79.0399 1049.65 95.4599 1027.5 111.66C1022.39 115.7 1017.29 117.2 1012.39 117.2C1009.41 117.2 1003.88 116.35 1003.88 111.23C1003.88 108.89 1005.37 107.39 1007.72 106.97C1023.9 104.19 1048.39 70.7399 1048.39 22.5799C1048.39 11.0699 1039.02 1.69995 1027.52 1.69995C1016.02 1.69995 1006.65 11.0799 1006.65 22.5799C1006.65 39.4099 1016.43 51.3399 1016.43 78.6299C1016.43 89.9199 1010.04 97.8099 1003.87 97.8099C1001.53 97.8099 999.4 95.8899 999.4 93.5499C999.4 91.2099 1003.03 87.1599 1003.03 78.2099C1003.03 50.9299 971.52 0.439941 949.37 0.439941C935.95 0.439941 928.5 10.6699 928.5 20.8999C928.5 27.2899 931.28 33.6899 936.38 37.5199C949.37 48.1799 962.36 49.8799 983.66 66.7199C989.63 71.4099 992.82 77.8 992.82 83.14C992.82 87.4 990.89 89.9599 987.5 89.9599C985.37 89.9599 983.87 88.6799 983.03 86.5499H982.99L983.03 86.5199H983.02Z" />
    </svg>
  );
}

type DialogStep = "email" | "code" | "success";

interface SuccessData {
  linked: boolean;
  importedBookings: number;
}

/**
 * Wellhub card for the profile's "Connected apps" section. Auto-linked members
 * just see the linked state; everyone else can claim the (often corporate)
 * email their employer registered on Wellhub via a one-time code.
 */
export function WellhubConnection() {
  const t = useTranslations("wearables");
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery<WellhubLinkStatus>({
    queryKey: WELLHUB_LINK_QUERY_KEY,
    queryFn: fetchWellhubLinkStatus,
  });

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<DialogStep>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [success, setSuccess] = useState<SuccessData | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const refreshEverywhere = () => {
    queryClient.invalidateQueries({ queryKey: WELLHUB_LINK_QUERY_KEY });
    // Imported classes touch history, progress and achievements rendered by
    // server components across the app.
    router.refresh();
  };

  const apiError = (payload: unknown): string => {
    if (payload && typeof payload === "object" && "error" in payload) {
      return String((payload as { error: unknown }).error);
    }
    return "generic";
  };

  const requestMutation = useMutation({
    mutationFn: async (targetEmail: string) => {
      const res = await fetch("/api/wellhub/link/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(apiError(data));
      return data as {
        sent?: boolean;
        cooldownSeconds?: number;
        linkedImmediately?: boolean;
        linked?: boolean;
        importedBookings?: number;
      };
    },
    onSuccess: (data) => {
      setErrorKey(null);
      if (data.linkedImmediately) {
        setSuccess({ linked: Boolean(data.linked), importedBookings: data.importedBookings ?? 0 });
        setStep("success");
        refreshEverywhere();
        return;
      }
      setStep("code");
      setCode("");
      setAttemptsRemaining(null);
      setCooldown(data.cooldownSeconds ?? 60);
      setTimeout(() => codeInputRef.current?.focus(), 50);
    },
    onError: (err: Error) => {
      setErrorKey(err.message);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (typedCode: string) => {
      const res = await fetch("/api/wellhub/link/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: typedCode }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const key = apiError(data);
        if (
          key === "wrong_code" &&
          data &&
          typeof data === "object" &&
          "attemptsRemaining" in data
        ) {
          setAttemptsRemaining(Number((data as { attemptsRemaining: unknown }).attemptsRemaining));
        }
        throw new Error(key);
      }
      return data as { linked: boolean; importedBookings: number };
    },
    onSuccess: (data) => {
      setErrorKey(null);
      setSuccess({ linked: data.linked, importedBookings: data.importedBookings });
      setStep("success");
      refreshEverywhere();
    },
    onError: (err: Error) => {
      setErrorKey(err.message);
    },
  });

  // Tenant doesn't work with Wellhub (or status still unknown) → no card.
  if (isLoading || !status?.enabled) return null;

  const errorMessage = (key: string): string => {
    switch (key) {
      case "invalid_email":
        return t("wellhubErrInvalidEmail");
      case "belongs_to_account":
        return t("wellhubErrBelongsToAccount");
      case "claimed_by_other":
        return t("wellhubErrClaimedByOther");
      case "too_many_requests":
        return t("wellhubErrTooManyRequests");
      case "cooldown":
        return t("wellhubErrCooldown");
      case "send_failed":
        return t("wellhubErrSendFailed");
      case "wrong_code":
        return attemptsRemaining !== null && attemptsRemaining > 0
          ? t("wellhubErrWrongCodeAttempts", { count: attemptsRemaining })
          : t("wellhubErrWrongCode");
      case "expired":
        return t("wellhubErrExpired");
      case "too_many_attempts":
      case "no_pending_code":
        return t("wellhubErrTooManyAttempts");
      default:
        return t("wellhubErrGeneric");
    }
  };

  const openDialog = () => {
    setStep("email");
    setEmail("");
    setCode("");
    setErrorKey(null);
    setAttemptsRemaining(null);
    setSuccess(null);
    setOpen(true);
  };

  const busy = requestMutation.isPending || verifyMutation.isPending;

  return (
    <>
      <div className="rounded-xl border border-border/50 bg-card p-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${WELLHUB_PINK}15` }}
          >
            <WellhubMark className="h-5 w-5" style={{ color: WELLHUB_PINK }} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-foreground">Wellhub</p>
            {status.linked ? (
              <p className="flex items-center gap-1 text-[11px] font-medium text-green-600">
                <Check className="h-3 w-3" />
                {t("connected")}
              </p>
            ) : status.claimPending ? (
              <p className="text-[11px] text-muted">{t("wellhubWaiting")}</p>
            ) : (
              <p className="text-[11px] text-muted">{t("wellhubTagline")}</p>
            )}
          </div>

          {!status.linked && (
            <Button
              size="sm"
              className="h-8 rounded-full text-[12px] text-white"
              style={{ backgroundColor: WELLHUB_PINK }}
              onClick={openDialog}
            >
              {t("wellhubLinkCta")}
            </Button>
          )}
        </div>

        {status.linked && (
          <p className="mt-2 pl-[52px] text-[10px] text-muted">
            {status.email
              ? t("wellhubLinkedAs", { email: status.email })
              : t("wellhubSyncDescription")}
            {typeof status.attendedCount === "number" && status.attendedCount > 0 && (
              <> · {t("wellhubClasses", { count: status.attendedCount })}</>
            )}
          </p>
        )}
        {!status.linked && status.claimPending && status.claimEmail && (
          <p className="mt-2 pl-[52px] text-[10px] text-muted">
            {t("wellhubWaitingAs", { email: status.claimEmail })}
          </p>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          {step === "email" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <WellhubMark className="h-5 w-5" style={{ color: WELLHUB_PINK }} />
                  {t("wellhubDialogTitle")}
                </DialogTitle>
                <DialogDescription>{t("wellhubDialogIntro")}</DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!busy && email.trim()) requestMutation.mutate(email);
                }}
                className="space-y-3"
              >
                <div className="space-y-1.5">
                  <label htmlFor="wellhub-email" className="text-[13px] font-medium text-foreground">
                    {t("wellhubEmailLabel")}
                  </label>
                  <Input
                    id="wellhub-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder={t("wellhubEmailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                {errorKey && (
                  <p className="text-[12px] font-medium text-destructive">{errorMessage(errorKey)}</p>
                )}
                <Button
                  type="submit"
                  className="w-full rounded-full text-white"
                  style={{ backgroundColor: WELLHUB_PINK }}
                  disabled={busy || !email.trim()}
                >
                  {requestMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t("wellhubSendCode")
                  )}
                </Button>
              </form>
            </>
          )}

          {step === "code" && (
            <>
              <DialogHeader>
                <DialogTitle>{t("wellhubEnterCode")}</DialogTitle>
                <DialogDescription>
                  {t("wellhubCodeSentTo", { email: email.trim().toLowerCase() })}
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!busy && code.replace(/\D/g, "").length === 6) {
                    verifyMutation.mutate(code.replace(/\D/g, ""));
                  }
                }}
                className="space-y-3"
              >
                <Input
                  ref={codeInputRef}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  className="text-center text-[22px] font-bold tracking-[0.5em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
                {errorKey && (
                  <p className="text-[12px] font-medium text-destructive">{errorMessage(errorKey)}</p>
                )}
                <Button
                  type="submit"
                  className="w-full rounded-full text-white"
                  style={{ backgroundColor: WELLHUB_PINK }}
                  disabled={busy || code.replace(/\D/g, "").length !== 6}
                >
                  {verifyMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t("wellhubVerify")
                  )}
                </Button>
                <button
                  type="button"
                  className="w-full text-center text-[12px] font-medium text-muted disabled:opacity-50"
                  disabled={busy || cooldown > 0}
                  onClick={() => requestMutation.mutate(email)}
                >
                  {cooldown > 0 ? t("wellhubResendIn", { seconds: cooldown }) : t("wellhubResend")}
                </button>
              </form>
            </>
          )}

          {step === "success" && success && (
            <div className="flex flex-col items-center py-2 text-center">
              <div
                className="mb-3 flex h-14 w-14 items-center justify-center rounded-full"
                style={{ backgroundColor: `${WELLHUB_PINK}15` }}
              >
                <PartyPopper className="h-7 w-7" style={{ color: WELLHUB_PINK }} />
              </div>
              <DialogTitle className="mb-1">
                {success.linked ? t("wellhubSuccessTitle") : t("wellhubWaitingTitle")}
              </DialogTitle>
              <p className="mb-4 text-[13px] text-muted">
                {success.linked
                  ? success.importedBookings > 0
                    ? t("wellhubSuccessImported", { count: success.importedBookings })
                    : t("wellhubSuccessLinked")
                  : t("wellhubSuccessWaiting")}
              </p>
              <Button
                className="w-full rounded-full text-white"
                style={{ backgroundColor: WELLHUB_PINK }}
                onClick={() => setOpen(false)}
              >
                {t("wellhubDone")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
