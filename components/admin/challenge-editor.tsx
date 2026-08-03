"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2, Loader2, Info, ImagePlus, Trophy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface ChallengeDraft {
  id?: string;
  name: string;
  description: string;
  imageUrl: string | null;
  durationDays: number;
  enrollOpensAt: string;
  enrollClosesAt: string;
  studioIds: string[];
  basePoints: number;
  firstDisciplineBonus: number;
  firstCoachBonus: number;
  dailyPointsCap: number | null;
  bonusSlots: { dayOfWeek: number; hour: number; points: number }[];
  prizes: { fromRank: number; toRank: number; title: string }[];
}

export function emptyDraft(today: string, inTwoWeeks: string): ChallengeDraft {
  return {
    name: "",
    description: "",
    imageUrl: null,
    durationDays: 30,
    enrollOpensAt: today,
    enrollClosesAt: inTwoWeeks,
    studioIds: [],
    basePoints: 10,
    firstDisciplineBonus: 15,
    firstCoachBonus: 10,
    dailyPointsCap: 25,
    bonusSlots: [],
    prizes: [],
  };
}

// Monday-first, matching every schedule surface.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: ChallengeDraft;
  studios: { id: string; name: string }[];
  /** Published challenges freeze their rules; only presentation stays editable. */
  locked: boolean;
  saving: boolean;
  error: string | null;
  onSave: (draft: ChallengeDraft) => void;
}

export function ChallengeEditor({
  open,
  onOpenChange,
  draft: initial,
  studios,
  locked,
  saving,
  error,
  onSave,
}: Props) {
  const t = useTranslations("admin.challengesPage");
  const [draft, setDraft] = useState<ChallengeDraft>(initial);

  // Remount on a different challenge so the form doesn't keep stale values.
  const key = initial.id ?? "new";
  const [lastKey, setLastKey] = useState(key);
  if (lastKey !== key) {
    setLastKey(key);
    setDraft(initial);
  }

  const set = <K extends keyof ChallengeDraft>(field: K, value: ChallengeDraft[K]) =>
    setDraft((d) => ({ ...d, [field]: value }));

  const dayLabels = useMemo(() => {
    // 2026-06-07 was a Sunday; +i walks Sun..Sat in UTC.
    const fmt = new Intl.DateTimeFormat(undefined, { weekday: "long", timeZone: "UTC" });
    return Array.from({ length: 7 }, (_, dow) => fmt.format(new Date(Date.UTC(2026, 5, 7 + dow))));
  }, []);

  const endsAt = useMemo(() => {
    if (!draft.enrollClosesAt) return null;
    const d = new Date(`${draft.enrollClosesAt}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + draft.durationDays);
    return d.toISOString().slice(0, 10);
  }, [draft.enrollClosesAt, draft.durationDays]);

  const maxPerClass =
    draft.basePoints + draft.firstDisciplineBonus + draft.firstCoachBonus;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial.id ? t("editTitle") : t("newTitle")}</DialogTitle>
          <DialogDescription>{t("editorSubtitle")}</DialogDescription>
        </DialogHeader>

        {locked && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t("lockedNotice")}
          </p>
        )}

        <div className="space-y-5">
          <BadgePicker
            value={draft.imageUrl}
            onChange={(url) => set("imageUrl", url)}
          />

          <div className="space-y-2">
            <Label htmlFor="ch-name">{t("name")}</Label>
            <Input
              id="ch-name"
              value={draft.name}
              maxLength={80}
              onChange={(e) => set("name", e.target.value)}
              placeholder={t("namePlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ch-desc">{t("description")}</Label>
            <Textarea
              id="ch-desc"
              value={draft.description}
              rows={2}
              onChange={(e) => set("description", e.target.value)}
              placeholder={t("descriptionPlaceholder")}
            />
          </div>

          <fieldset disabled={locked} className={cn(locked && "opacity-60")}>
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="ch-opens">{t("enrollOpens")}</Label>
                  <Input
                    id="ch-opens"
                    type="date"
                    value={draft.enrollOpensAt}
                    onChange={(e) => set("enrollOpensAt", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ch-closes">{t("enrollCloses")}</Label>
                  <Input
                    id="ch-closes"
                    type="date"
                    value={draft.enrollClosesAt}
                    onChange={(e) => set("enrollClosesAt", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ch-duration">{t("durationDays")}</Label>
                  <Input
                    id="ch-duration"
                    type="number"
                    min={1}
                    max={365}
                    value={draft.durationDays}
                    onChange={(e) => set("durationDays", Number(e.target.value))}
                  />
                </div>
              </div>

              <p className="rounded-lg bg-muted/10 p-3 text-xs text-muted">
                {t("windowExplainer", { days: draft.durationDays })}
                {endsAt && ` ${t("globalEnd", { date: endsAt })}`}
              </p>

              {studios.length > 1 && (
                <div className="space-y-2">
                  <Label>{t("studios")}</Label>
                  <div className="flex flex-wrap gap-2">
                    {studios.map((s) => {
                      const on =
                        draft.studioIds.length === 0 || draft.studioIds.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() =>
                            set(
                              "studioIds",
                              draft.studioIds.includes(s.id)
                                ? draft.studioIds.filter((x) => x !== s.id)
                                : [...draft.studioIds, s.id],
                            )
                          }
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs transition",
                            on
                              ? "border-admin bg-admin/10 text-foreground"
                              : "border-border/60 text-muted",
                          )}
                        >
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted">{t("studiosHint")}</p>
                </div>
              )}

              <div className="space-y-3">
                <Label>{t("points")}</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <NumberField
                    label={t("basePoints")}
                    hint={t("basePointsHint")}
                    value={draft.basePoints}
                    onChange={(v) => set("basePoints", v)}
                  />
                  <NumberField
                    label={t("firstDisciplineBonus")}
                    hint={t("firstDisciplineHint")}
                    value={draft.firstDisciplineBonus}
                    onChange={(v) => set("firstDisciplineBonus", v)}
                  />
                  <NumberField
                    label={t("firstCoachBonus")}
                    hint={t("firstCoachHint")}
                    value={draft.firstCoachBonus}
                    onChange={(v) => set("firstCoachBonus", v)}
                  />
                  <NumberField
                    label={t("dailyCap")}
                    hint={t("dailyCapHint")}
                    value={draft.dailyPointsCap ?? 0}
                    onChange={(v) => set("dailyPointsCap", v > 0 ? v : null)}
                    zeroLabel={t("noCap")}
                  />
                </div>
                <p className="text-[11px] text-muted">
                  {t("maxPerClass", { points: maxPerClass })}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{t("bonusSlots")}</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      set("bonusSlots", [
                        ...draft.bonusSlots,
                        { dayOfWeek: 1, hour: 10, points: 5 },
                      ])
                    }
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    {t("addSlot")}
                  </Button>
                </div>
                <p className="text-[11px] text-muted">{t("bonusSlotsHint")}</p>
                <div className="space-y-2">
                  {draft.bonusSlots.map((slot, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Select
                        value={String(slot.dayOfWeek)}
                        onValueChange={(v) =>
                          set(
                            "bonusSlots",
                            draft.bonusSlots.map((s, j) =>
                              j === i ? { ...s, dayOfWeek: Number(v) } : s,
                            ),
                          )
                        }
                      >
                        <SelectTrigger className="h-9 flex-1 text-xs capitalize">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DAY_ORDER.map((d) => (
                            <SelectItem key={d} value={String(d)} className="capitalize">
                              {dayLabels[d]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={String(slot.hour)}
                        onValueChange={(v) =>
                          set(
                            "bonusSlots",
                            draft.bonusSlots.map((s, j) =>
                              j === i ? { ...s, hour: Number(v) } : s,
                            ),
                          )
                        }
                      >
                        <SelectTrigger className="h-9 w-[90px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, h) => (
                            <SelectItem key={h} value={String(h)}>
                              {String(h).padStart(2, "0")}:00
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min={1}
                        className="h-9 w-[80px]"
                        value={slot.points}
                        onChange={(e) =>
                          set(
                            "bonusSlots",
                            draft.bonusSlots.map((s, j) =>
                              j === i ? { ...s, points: Number(e.target.value) } : s,
                            ),
                          )
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        onClick={() =>
                          set(
                            "bonusSlots",
                            draft.bonusSlots.filter((_, j) => j !== i),
                          )
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </fieldset>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("prizes")}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const next = draft.prizes.length
                    ? Math.max(...draft.prizes.map((p) => p.toRank)) + 1
                    : 1;
                  set("prizes", [
                    ...draft.prizes,
                    { fromRank: next, toRank: next, title: "" },
                  ]);
                }}
              >
                <Plus className="mr-1 h-3 w-3" />
                {t("addPrize")}
              </Button>
            </div>
            <div className="space-y-2">
              {draft.prizes.map((prize, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    className="h-9 w-[70px]"
                    value={prize.fromRank}
                    onChange={(e) =>
                      set(
                        "prizes",
                        draft.prizes.map((p, j) =>
                          j === i ? { ...p, fromRank: Number(e.target.value) } : p,
                        ),
                      )
                    }
                  />
                  <span className="text-xs text-muted">{t("toRank")}</span>
                  <Input
                    type="number"
                    min={1}
                    className="h-9 w-[70px]"
                    value={prize.toRank}
                    onChange={(e) =>
                      set(
                        "prizes",
                        draft.prizes.map((p, j) =>
                          j === i ? { ...p, toRank: Number(e.target.value) } : p,
                        ),
                      )
                    }
                  />
                  <Input
                    className="h-9 flex-1"
                    placeholder={t("prizePlaceholder")}
                    value={prize.title}
                    onChange={(e) =>
                      set(
                        "prizes",
                        draft.prizes.map((p, j) =>
                          j === i ? { ...p, title: e.target.value } : p,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => set("prizes", draft.prizes.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              {t("cancel")}
            </Button>
            <Button onClick={() => onSave(draft)} disabled={saving || !draft.name.trim()}>
              {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {t("save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  zeroLabel,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  zeroLabel?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-normal text-muted">{label}</Label>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <p className="text-[11px] text-muted/70">
        {value === 0 && zeroLabel ? zeroLabel : hint}
      </p>
    </div>
  );
}

/**
 * Optional badge, like the ones Strava puts on its challenges. Nothing
 * downstream requires it — the member card falls back to the trophy icon —
 * so this stays a one-tap affair with an obvious way back out.
 */
function BadgePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const t = useTranslations("admin.challengesPage");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/challenges/upload", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "failed");
      onChange(json.url);
    } catch (e) {
      setError(e instanceof Error && e.message === "too_large" ? t("imageTooLarge") : t("imageFailed"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label>{t("image")}</Label>
      <div className="flex items-center gap-3">
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted/10">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <Trophy className="h-6 w-6 text-muted/50" />
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-card/70">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-xs font-medium transition hover:bg-muted/10">
              <ImagePlus className="h-3.5 w-3.5" />
              {value ? t("imageReplace") : t("imageAdd")}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) upload(file);
                  e.target.value = "";
                }}
              />
            </label>
            {value && (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted hover:bg-muted/10"
              >
                <X className="h-3 w-3" />
                {t("imageRemove")}
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted">{error ?? t("imageHint")}</p>
        </div>
      </div>
    </div>
  );
}
