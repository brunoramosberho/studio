import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

/**
 * Per-coach substitution summary for /admin/substitutions — how many
 * substitutions each instructor has *requested* (as the one bailing) and how
 * many classes they've *covered* for others. Lets admins spot lopsided usage.
 *
 * Query param `days`: "all" (default) or a positive integer number of days
 * back from now (e.g. 7, 30, 90), filtering on request creation time.
 */
export async function GET(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");

    const daysParam = request.nextUrl.searchParams.get("days") || "all";
    let createdAtFilter: { gte: Date } | undefined;
    if (daysParam !== "all") {
      const days = Number(daysParam);
      if (!Number.isFinite(days) || days <= 0 || days > 3650) {
        return NextResponse.json(
          { error: "days must be 'all' or 1..3650" },
          { status: 400 },
        );
      }
      createdAtFilter = {
        gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
      };
    }

    const [coaches, requests] = await Promise.all([
      prisma.coachProfile.findMany({
        where: { tenantId: tenant.id, isActive: true },
        select: { id: true, name: true, photoUrl: true, color: true },
        orderBy: { name: "asc" },
      }),
      prisma.substitutionRequest.findMany({
        where: {
          tenantId: tenant.id,
          ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
        },
        select: {
          status: true,
          requestingCoachId: true,
          acceptedByCoachId: true,
        },
      }),
    ]);

    type Row = {
      id: string;
      name: string | null;
      photoUrl: string | null;
      color: string;
      requested: number;
      accepted: number; // requested subs that were accepted
      pending: number; // PENDING + PENDING_ADMIN
      rejected: number;
      cancelled: number;
      expired: number;
      covered: number; // classes this coach took over for others
    };

    const rows = new Map<string, Row>();
    for (const c of coaches) {
      rows.set(c.id, {
        id: c.id,
        name: c.name,
        photoUrl: c.photoUrl,
        color: c.color,
        requested: 0,
        accepted: 0,
        pending: 0,
        rejected: 0,
        cancelled: 0,
        expired: 0,
        covered: 0,
      });
    }

    // Coaches with activity but no longer active still deserve a row so the
    // totals reconcile — lazily create one keyed by id if missing.
    const ensureRow = (id: string): Row => {
      let row = rows.get(id);
      if (!row) {
        row = {
          id,
          name: null,
          photoUrl: null,
          color: "#78716c",
          requested: 0,
          accepted: 0,
          pending: 0,
          rejected: 0,
          cancelled: 0,
          expired: 0,
          covered: 0,
        };
        rows.set(id, row);
      }
      return row;
    };

    for (const r of requests) {
      const requester = ensureRow(r.requestingCoachId);
      requester.requested++;
      switch (r.status) {
        case "ACCEPTED":
          requester.accepted++;
          break;
        case "PENDING":
        case "PENDING_ADMIN":
          requester.pending++;
          break;
        case "REJECTED":
          requester.rejected++;
          break;
        case "CANCELLED":
          requester.cancelled++;
          break;
        case "EXPIRED":
          requester.expired++;
          break;
      }

      if (r.status === "ACCEPTED" && r.acceptedByCoachId) {
        ensureRow(r.acceptedByCoachId).covered++;
      }
    }

    const summary = Array.from(rows.values()).sort(
      (a, b) =>
        b.requested - a.requested ||
        b.covered - a.covered ||
        (a.name ?? "").localeCompare(b.name ?? ""),
    );

    const totals = {
      requested: requests.length,
      covered: requests.filter(
        (r) => r.status === "ACCEPTED" && r.acceptedByCoachId,
      ).length,
    };

    return NextResponse.json({ summary, totals, days: daysParam });
  } catch (error) {
    console.error("GET /api/admin/substitutions/summary error:", error);
    return NextResponse.json(
      { error: "Failed to load summary" },
      { status: 500 },
    );
  }
}
