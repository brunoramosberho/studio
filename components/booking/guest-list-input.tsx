"use client";

import { useState } from "react";
import { Plus, X, UserPlus, Users, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface GuestEntry {
  name: string;
  email: string;
}

interface GuestListInputProps {
  guests: GuestEntry[];
  onChange: (guests: GuestEntry[]) => void;
  maxGuests?: number | null;
  disabled?: boolean;
}

export function GuestListInput({
  guests,
  onChange,
  maxGuests,
  disabled,
}: GuestListInputProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canAddMore = maxGuests == null || guests.length < maxGuests;

  function handleAdd() {
    setError(null);
    const trimmedName = newName.trim();
    const trimmedEmail = newEmail.trim().toLowerCase();

    if (!trimmedName) {
      setError("Ingresa el nombre completo");
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Ingresa un correo electrónico válido");
      return;
    }
    if (guests.some((g) => g.email.toLowerCase() === trimmedEmail)) {
      setError("Este correo ya fue agregado");
      return;
    }

    onChange([...guests, { name: trimmedName, email: trimmedEmail }]);
    setNewName("");
    setNewEmail("");
    setError(null);
    setIsAdding(false);
  }

  function handleRemove(index: number) {
    onChange(guests.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Users className="h-4 w-4 text-muted" />
          Invitados
          {guests.length > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent/10 px-1.5 text-xs font-semibold text-accent">
              {guests.length}
            </span>
          )}
        </div>
        {maxGuests != null && (
          <span className="text-xs text-muted">
            Máx. {maxGuests}
          </span>
        )}
      </div>

      {/* Guest list */}
      {guests.length > 0 && (
        <div className="space-y-2">
          {guests.map((guest, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface/50 px-3 py-2.5"
            >
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent/10">
                <User className="h-3.5 w-3.5 text-accent" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {guest.name}
                </p>
                <p className="truncate text-xs text-muted">{guest.email}</p>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(i)}
                disabled={disabled}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add guest form */}
      {isAdding ? (
        <Card className="rounded-xl border-accent/20">
          <CardContent className="space-y-3 p-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted">
                Nombre completo
              </label>
              <Input
                placeholder="Nombre del invitado"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={disabled}
                className="min-h-[44px]"
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted">
                Correo electrónico
              </label>
              <Input
                type="email"
                placeholder="correo@ejemplo.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                disabled={disabled}
                className="min-h-[44px]"
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
            </div>
            {error && (
              <p className="text-xs text-red-600">{error}</p>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleAdd}
                disabled={disabled}
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsAdding(false);
                  setNewName("");
                  setNewEmail("");
                  setError(null);
                }}
              >
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : canAddMore && !disabled ? (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3",
            "text-sm font-medium text-muted transition-colors",
            "hover:border-accent/40 hover:bg-accent/5 hover:text-accent",
          )}
        >
          <UserPlus className="h-4 w-4" />
          Agregar invitado
        </button>
      ) : null}
    </div>
  );
}
