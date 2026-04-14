"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  ChevronDown,
  Plus,
  X,
  Eye,
  UserCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CreateClientDialog } from "@/components/admin/create-client-dialog";
import { CustomerPreview } from "./customer-preview";
import { usePosStore, type PosCustomer } from "@/store/pos-store";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface ClientResult {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  phone?: string | null;
}

export function CustomerStep() {
  const t = useTranslations("pos");
  const {
    customer,
    setCustomer,
    setStep,
  } = usePosStore();

  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: clients = [], isLoading } = useQuery<ClientResult[]>({
    queryKey: ["admin-clients-search"],
    queryFn: async () => {
      const res = await fetch("/api/admin/clients");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30_000,
  });

  const filtered = search.trim()
    ? clients.filter(
        (c) =>
          c.name?.toLowerCase().includes(search.toLowerCase()) ||
          c.email.toLowerCase().includes(search.toLowerCase()),
      )
    : clients;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = useCallback(
    (client: ClientResult) => {
      setCustomer({
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone ?? null,
        image: client.image,
      });
      setDropdownOpen(false);
      setSearch("");
    },
    [setCustomer],
  );

  const handleClear = () => {
    setCustomer(null);
    setSearch("");
  };

  const handleClientCreated = () => {
    setShowCreateClient(false);
  };

  const initials = customer
    ? (customer.name ?? customer.email[0])
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "";

  return (
    <div className="space-y-5">
      <h3 className="font-display text-lg font-bold">{t("customer")}</h3>

      {/* Customer selector */}
      <div className="flex items-center gap-2.5">
        <div ref={dropdownRef} className="relative flex-1">
          {customer ? (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-admin/10">
                {customer.image ? (
                  <img
                    src={customer.image}
                    alt=""
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-semibold text-admin">
                    {initials}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {customer.name ?? t("noName")}
                </p>
                <p className="truncate text-xs text-muted">{customer.email}</p>
              </div>
              <button
                onClick={handleClear}
                className="rounded-full p-1.5 text-muted hover:bg-surface hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="rounded-full p-1.5 text-muted hover:bg-surface hover:text-foreground"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div
              className={cn(
                "flex items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-colors cursor-text",
                dropdownOpen
                  ? "border-admin/40 ring-2 ring-admin/10"
                  : "border-border hover:border-border/80",
              )}
              onClick={() => {
                setDropdownOpen(true);
                inputRef.current?.focus();
              }}
            >
              <Search className="h-4 w-4 shrink-0 text-muted/50" />
              <input
                ref={inputRef}
                type="text"
                placeholder={t("selectCustomer")}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setDropdownOpen(true);
                }}
                onFocus={() => setDropdownOpen(true)}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/50"
              />
              <ChevronDown className="h-4 w-4 shrink-0 text-muted/40" />
            </div>
          )}

          {/* Dropdown */}
          {dropdownOpen && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-border/60 bg-card py-1.5 shadow-lg">
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="px-4 py-4 text-center text-sm text-muted">
                  {t("noClientsFound")}
                </p>
              ) : (
                filtered.slice(0, 25).map((client) => (
                  <button
                    key={client.id}
                    onClick={() => handleSelect(client)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-admin/5">
                      {client.image ? (
                        <img
                          src={client.image}
                          alt=""
                          className="h-9 w-9 rounded-full object-cover"
                        />
                      ) : (
                        <UserCircle className="h-4.5 w-4.5 text-muted/50" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {client.name ?? t("noName")}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {client.email}
                      </p>
                    </div>
                  </button>
                ))
              )}

              <div className="border-t border-border/40 mt-1 pt-1">
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    setShowCreateClient(true);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-surface"
                >
                  <UserCircle className="h-4.5 w-4.5 text-muted/50" />
                  {t("newCustomer")}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Add new customer button */}
        <button
          onClick={() => setShowCreateClient(true)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted transition-colors hover:bg-surface hover:text-foreground"
        >
          <Plus className="h-4.5 w-4.5" />
        </button>

        {/* View customer detail button */}
        {customer && (
          <button
            onClick={() => setShowPreview(true)}
            title={t("viewCustomerProfile")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted transition-colors hover:bg-surface hover:text-foreground"
          >
            <Eye className="h-4.5 w-4.5" />
          </button>
        )}
      </div>

      {/* Create client dialog */}
      <CreateClientDialog
        open={showCreateClient}
        onOpenChange={setShowCreateClient}
        onCreated={handleClientCreated}
      />

      {/* Customer preview dialog */}
      {customer && (
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="sm:max-w-md">
            <CustomerPreview
              customer={customer}
              onClose={() => setShowPreview(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
