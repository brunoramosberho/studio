"use client";

import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslations, useLocale } from "next-intl";
import { motion } from "framer-motion";
import { Loader2, CalendarCheck2, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { timeAgo, cn } from "@/lib/utils";

interface BookingRow {
  id: string;
  userId: string | null;
  userName: string;
  userImage: string | null;
  className: string;
  studioName: string | null;
  classStartsAt: string;
  status: string;
  createdAt: string;
}

interface Page {
  bookings: BookingRow[];
  nextCursor: string | null;
}

export default function AdminBookingsPage() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const locale = useLocale();
  const dfns = locale === "en" ? enUS : es;

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery<Page>({
      queryKey: ["admin-bookings"],
      queryFn: async ({ pageParam }) => {
        const url = pageParam
          ? `/api/admin/bookings?cursor=${pageParam}`
          : "/api/admin/bookings";
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to load bookings");
        return res.json();
      },
      initialPageParam: null as string | null,
      getNextPageParam: (last) => last.nextCursor,
    });

  const bookings = data?.pages.flatMap((p) => p.bookings) ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">
          {t("allBookingsTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted">{t("allBookingsSubtitle")}</p>
      </motion.div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted" />
          </div>
        ) : bookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <CalendarCheck2 className="h-8 w-8 text-muted/30" />
            <p className="text-sm text-muted">{t("noBookings")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {bookings.map((b) => {
              const inner = (
                <div className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface/60">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-admin/10">
                    {b.userImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.userImage} alt={b.userName} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-sm font-semibold text-admin">
                        {b.userName?.[0] ?? "?"}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {b.userName}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {b.className}
                      {b.studioName ? ` · ${b.studioName}` : ""}
                      {" · "}
                      {format(new Date(b.classStartsAt), "EEE d MMM, HH:mm", { locale: dfns })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={cn(
                        "hidden rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline-block",
                        b.status === "ATTENDED"
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                          : "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
                      )}
                    >
                      {b.status === "ATTENDED" ? t("attendedLabel") : t("bookedLabel")}
                    </span>
                    <span className="whitespace-nowrap text-xs text-muted">
                      {timeAgo(b.createdAt)}
                    </span>
                    {b.userId && <ChevronRight className="h-4 w-4 text-muted/40" />}
                  </div>
                </div>
              );
              return (
                <li key={b.id}>
                  {b.userId ? (
                    <Link href={`/admin/clients/${b.userId}`}>{inner}</Link>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {hasNextPage && (
        <div className="flex justify-center">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2 text-sm font-medium text-foreground transition hover:bg-surface/60 disabled:opacity-50"
          >
            {isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />}
            {tc("loadMore")}
          </button>
        </div>
      )}
    </div>
  );
}
