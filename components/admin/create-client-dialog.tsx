"use client";

import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserCheck, UserPlus, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PhoneInput, isValidPhoneNumber } from "@/components/ui/phone-input";
import { cn } from "@/lib/utils";

interface LookupResult {
  found: boolean;
  user?: {
    id: string;
    name: string | null;
    email: string;
    phone: string | null;
    image: string | null;
  };
  isMember?: boolean;
}

interface CreateClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

export function CreateClientDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateClientDialogProps) {
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);

  function reset() {
    setEmail("");
    setPhone("");
    setFirstName("");
    setLastName("");
    setLookup(null);
    setLookingUp(false);
    setLookupDone(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  const doLookup = useCallback(
    async (params: { email?: string; phone?: string }) => {
      const qs = params.email
        ? `email=${encodeURIComponent(params.email)}`
        : `phone=${encodeURIComponent(params.phone!)}`;

      setLookingUp(true);
      try {
        const res = await fetch(`/api/admin/clients/lookup?${qs}`);
        if (!res.ok) return;
        const data: LookupResult = await res.json();
        if (data.found) {
          setLookup(data);
        }
      } finally {
        setLookingUp(false);
        setLookupDone(true);
      }
    },
    [],
  );

  function handleEmailBlur() {
    if (!email || lookup?.found) return;
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;
    doLookup({ email: trimmed });
  }

  function handlePhoneBlur() {
    if (!phone || lookup?.found) return;
    if (!isValidPhoneNumber(phone)) return;
    doLookup({ phone });
  }

  const linkMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: lookup!.user!.email,
          name: lookup!.user!.name,
          phone: lookup!.user!.phone,
        }),
      });
      if (!res.ok) throw new Error("Failed to link");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
      onCreated?.();
      handleOpenChange(false);
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const name = [firstName.trim(), lastName.trim()]
        .filter(Boolean)
        .join(" ") || null;
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          name,
          phone: phone || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
      onCreated?.();
      handleOpenChange(false);
    },
  });

  const foundUser = lookup?.found ? lookup.user : null;
  const alreadyMember = lookup?.isMember ?? false;
  const showNameFields = lookupDone && !foundUser;

  const canCreate =
    email.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    firstName.trim();

  const isBusy =
    lookingUp || linkMutation.isPending || createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crear cliente</DialogTitle>
          <DialogDescription>
            Ingresa el correo o teléfono para buscar si ya existe en el sistema.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="client-email">Correo electrónico</Label>
            <Input
              id="client-email"
              type="email"
              placeholder="ejemplo@correo.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (lookup) {
                  setLookup(null);
                  setLookupDone(false);
                }
              }}
              onBlur={handleEmailBlur}
              disabled={!!foundUser || isBusy}
              autoFocus
            />
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label>Teléfono</Label>
            <PhoneInput
              value={phone}
              onChange={(val) => {
                setPhone(val);
                if (lookup) {
                  setLookup(null);
                  setLookupDone(false);
                }
              }}
              disabled={!!foundUser || isBusy}
            />
            {phone && !isValidPhoneNumber(phone) && (
              <p className="text-xs text-muted">
                Ingresa un número válido para buscar
              </p>
            )}
          </div>

          {/* Loading indicator */}
          {lookingUp && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Buscando...
            </div>
          )}

          {/* Found user card */}
          {foundUser && (
            <div
              className={cn(
                "rounded-xl border p-4",
                alreadyMember
                  ? "border-green-200 bg-green-50/60"
                  : "border-admin/20 bg-admin/5",
              )}
            >
              <div className="flex items-center gap-3">
                {foundUser.image ? (
                  <img
                    src={foundUser.image}
                    alt=""
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-admin/10">
                    <span className="text-sm font-semibold text-admin">
                      {(foundUser.name ?? foundUser.email[0])
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {foundUser.name ?? "Sin nombre"}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {foundUser.email}
                    {foundUser.phone && ` · ${foundUser.phone}`}
                  </p>
                </div>
                {alreadyMember ? (
                  <UserCheck className="h-5 w-5 shrink-0 text-green-600" />
                ) : (
                  <UserPlus className="h-5 w-5 shrink-0 text-admin" />
                )}
              </div>

              {alreadyMember && (
                <p className="mt-2 text-xs font-medium text-green-700">
                  Ya es cliente de este estudio
                </p>
              )}
            </div>
          )}

          {/* Name fields (only when user not found) */}
          {showNameFields && (
            <>
              <div className="flex items-center gap-2 text-sm text-muted">
                <AlertCircle className="h-4 w-4 shrink-0" />
                No se encontró. Completa los datos para crear el cliente.
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="client-first-name">Nombre</Label>
                  <Input
                    id="client-first-name"
                    placeholder="Nombre"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    disabled={isBusy}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client-last-name">Apellido</Label>
                  <Input
                    id="client-last-name"
                    placeholder="Apellido"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    disabled={isBusy}
                  />
                </div>
              </div>
            </>
          )}

          {/* Error messages */}
          {(linkMutation.isError || createMutation.isError) && (
            <p className="text-sm text-red-600">
              Ocurrió un error. Intenta de nuevo.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isBusy}
          >
            Cancelar
          </Button>

          {foundUser && !alreadyMember && (
            <Button
              className="bg-admin text-white hover:bg-admin/90"
              onClick={() => linkMutation.mutate()}
              disabled={isBusy}
            >
              {linkMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Agregar como cliente
            </Button>
          )}

          {showNameFields && (
            <Button
              className="bg-admin text-white hover:bg-admin/90"
              onClick={() => createMutation.mutate()}
              disabled={!canCreate || isBusy}
            >
              {createMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Crear
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
