"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Check,
  Clock,
  Loader2,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar, type UserAvatarUser } from "@/components/ui/user-avatar";
import { cn, formatDate, formatTime } from "@/lib/utils";

type Mode = "OPEN" | "DIRECT";
type Status = "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "EXPIRED";

interface ClassRef {
  id: string;
  startsAt: string;
  endsAt: string;
  classType: { name: string; color: string };
  room: { name: string };
}

interface CoachRef {
  id: string;
  name: string;
  photoUrl: string | null;
}

interface IncomingRequest {
  id: string;
  mode: Mode;
  status: Status;
  note: string | null;
  createdAt: string;
  class: ClassRef;
  requestingCoach: CoachRef;
}

interface OutgoingRequest {
  id: string;
  mode: Mode;
  status: Status;
  note: string | null;
  rejectionNote: string | null;
  createdAt: string;
  class: ClassRef;
  targetCoach: CoachRef | null;
  acceptedByCoach: CoachRef | null;
}

interface ListResponse {
  incoming: IncomingRequest[];
  outgoing: OutgoingRequest[];
}

export default function SubstitutionsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"incoming" | "outgoing">("incoming");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const { data, isLoading } = useQuery<ListResponse>({
    queryKey: ["coach-substitutions"],
    queryFn: async () => {
      const res = await fetch("/api/coach/substitutions");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["coach-substitutions"] });

  const acceptMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/coach/substitutions/${id}/accept`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      return json;
    },
    onSuccess: invalidate,
  });

  const rejectMutation = useMutation({
    mutationFn: async ({
      id,
      rejectionNote,
    }: {
      id: string;
      rejectionNote: string;
    }) => {
      const res = await fetch(`/api/coach/substitutions/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectionNote }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      return json;
    },
    onSuccess: () => {
      setRejectingId(null);
      setRejectNote("");
      invalidate();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/coach/substitutions/${id}/cancel`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      return json;
    },
    onSuccess: invalidate,
  });

  const incoming = data?.incoming ?? [];
  const outgoing = data?.outgoing ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      <div>
        <h1 className="font-display text-2xl font-bold">Suplencias</h1>
        <p className="mt-1 text-sm text-muted">
          Pide o cubre clases cuando un instructor no pueda dar la suya.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="incoming" className="gap-2">
            <Sparkles className="h-3.5 w-3.5" />
            Recibidas
            {incoming.length > 0 && (
              <Badge className="ml-1 bg-coach text-white">
                {incoming.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="outgoing" className="gap-2">
            <Send className="h-3.5 w-3.5" />
            Enviadas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="incoming" className="mt-4 space-y-3">
          {isLoading ? (
            <SkeletonList />
          ) : incoming.length === 0 ? (
            <EmptyState message="No tienes solicitudes pendientes." />
          ) : (
            incoming.map((req) => (
              <IncomingCard
                key={req.id}
                req={req}
                onAccept={() => acceptMutation.mutate(req.id)}
                onReject={() => setRejectingId(req.id)}
                accepting={
                  acceptMutation.isPending &&
                  acceptMutation.variables === req.id
                }
                error={
                  acceptMutation.isError && acceptMutation.variables === req.id
                    ? (acceptMutation.error as Error).message
                    : null
                }
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="outgoing" className="mt-4 space-y-3">
          {isLoading ? (
            <SkeletonList />
          ) : outgoing.length === 0 ? (
            <EmptyState message="No has pedido ninguna suplencia." />
          ) : (
            outgoing.map((req) => (
              <OutgoingCard
                key={req.id}
                req={req}
                onCancel={() => cancelMutation.mutate(req.id)}
                cancelling={
                  cancelMutation.isPending &&
                  cancelMutation.variables === req.id
                }
              />
            ))
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={!!rejectingId}
        onOpenChange={(open) => {
          if (!open) {
            setRejectingId(null);
            setRejectNote("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar suplencia</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted">
            Puedes dejarle un mensaje al instructor (opcional).
          </p>
          <Textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="Estoy fuera ese día…"
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setRejectingId(null);
                setRejectNote("");
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() =>
                rejectingId &&
                rejectMutation.mutate({
                  id: rejectingId,
                  rejectionNote: rejectNote,
                })
              }
              disabled={rejectMutation.isPending}
              className="gap-2"
            >
              {rejectMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Rechazar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-32 rounded-2xl" />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <ArrowLeftRight className="h-8 w-8 text-muted/30" />
        <p className="text-sm text-muted">{message}</p>
      </CardContent>
    </Card>
  );
}

function IncomingCard({
  req,
  onAccept,
  onReject,
  accepting,
  error,
}: {
  req: IncomingRequest;
  onAccept: () => void;
  onReject: () => void;
  accepting: boolean;
  error: string | null;
}) {
  return (
    <Card className="overflow-hidden">
      <div
        className="h-1"
        style={{ backgroundColor: req.class.classType.color }}
      />
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-semibold">
                {req.class.classType.name}
              </h3>
              <ModeBadge mode={req.mode} />
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted">
              <span>{formatDate(req.class.startsAt)}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatTime(req.class.startsAt)} –{" "}
                {formatTime(req.class.endsAt)}
              </span>
              {req.class.room?.name && (
                <>
                  <span>·</span>
                  <span>{req.class.room.name}</span>
                </>
              )}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <UserAvatar
                user={
                  {
                    name: req.requestingCoach.name,
                    image: req.requestingCoach.photoUrl,
                  } as UserAvatarUser
                }
                size={28}
                showBadge={false}
              />
              <p className="text-xs text-muted">
                Solicitado por{" "}
                <strong className="text-foreground">
                  {req.requestingCoach.name}
                </strong>
              </p>
            </div>
            {req.note && (
              <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-xs italic text-muted">
                &ldquo;{req.note}&rdquo;
              </p>
            )}
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Button
            onClick={onAccept}
            disabled={accepting}
            className="flex-1 gap-2 bg-coach hover:bg-coach/90"
          >
            {accepting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Aceptar
          </Button>
          <Button
            variant="outline"
            onClick={onReject}
            className="gap-2"
            disabled={accepting}
          >
            <X className="h-4 w-4" />
            Rechazar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OutgoingCard({
  req,
  onCancel,
  cancelling,
}: {
  req: OutgoingRequest;
  onCancel: () => void;
  cancelling: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <div
        className="h-1"
        style={{ backgroundColor: req.class.classType.color }}
      />
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-semibold">
                {req.class.classType.name}
              </h3>
              <ModeBadge mode={req.mode} />
              <StatusBadge status={req.status} />
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted">
              <span>{formatDate(req.class.startsAt)}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatTime(req.class.startsAt)} –{" "}
                {formatTime(req.class.endsAt)}
              </span>
            </div>
            {req.targetCoach && (
              <div className="mt-3 flex items-center gap-2">
                <UserAvatar
                  user={
                    {
                      name: req.targetCoach.name,
                      image: req.targetCoach.photoUrl,
                    } as UserAvatarUser
                  }
                  size={28}
                  showBadge={false}
                />
                <p className="text-xs text-muted">
                  Enviada a{" "}
                  <strong className="text-foreground">
                    {req.targetCoach.name}
                  </strong>
                </p>
              </div>
            )}
            {req.acceptedByCoach && (
              <div className="mt-3 flex items-center gap-2">
                <UserAvatar
                  user={
                    {
                      name: req.acceptedByCoach.name,
                      image: req.acceptedByCoach.photoUrl,
                    } as UserAvatarUser
                  }
                  size={28}
                  showBadge={false}
                />
                <p className="text-xs text-green-600">
                  <strong>{req.acceptedByCoach.name}</strong> cubrirá tu clase
                </p>
              </div>
            )}
            {req.status === "REJECTED" && req.rejectionNote && (
              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs italic text-red-600">
                &ldquo;{req.rejectionNote}&rdquo;
              </p>
            )}
          </div>
        </div>

        {req.status === "PENDING" && (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={cancelling}
              className="gap-2 text-muted hover:text-red-600"
            >
              {cancelling && <Loader2 className="h-3 w-3 animate-spin" />}
              Cancelar solicitud
            </Button>
          </div>
        )}
        {req.status === "ACCEPTED" && (
          <div className="flex justify-end">
            <Link
              href={`/coach/class/${req.class.id}`}
              className="text-xs font-medium text-coach hover:underline"
            >
              Ver clase →
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ModeBadge({ mode }: { mode: Mode }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] uppercase tracking-wider",
        mode === "DIRECT"
          ? "border-amber-300 bg-amber-50 text-amber-700"
          : "border-blue-300 bg-blue-50 text-blue-700",
      )}
    >
      {mode === "DIRECT" ? "Directa" : "Abierta"}
    </Badge>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { label: string; cls: string }> = {
    PENDING: {
      label: "Pendiente",
      cls: "border-amber-300 bg-amber-50 text-amber-700",
    },
    ACCEPTED: {
      label: "Aceptada",
      cls: "border-green-300 bg-green-50 text-green-700",
    },
    REJECTED: {
      label: "Rechazada",
      cls: "border-red-300 bg-red-50 text-red-700",
    },
    CANCELLED: {
      label: "Cancelada",
      cls: "border-stone-300 bg-stone-50 text-stone-600",
    },
    EXPIRED: {
      label: "Expirada",
      cls: "border-stone-300 bg-stone-50 text-stone-600",
    },
  };
  const { label, cls } = map[status];
  return (
    <Badge variant="outline" className={cn("text-[10px]", cls)}>
      {label}
    </Badge>
  );
}
