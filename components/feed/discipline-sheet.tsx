"use client";

import { useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { X, Clock, BarChart3, ArrowRight } from "lucide-react";
import { getIconComponent } from "@/components/admin/icon-picker";
import { Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export interface DisciplineData {
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  mediaUrl?: string | null;
  tags?: string[];
  duration?: number;
  level?: string;
}

interface DisciplineSheetProps {
  open: boolean;
  onClose: () => void;
  discipline: DisciplineData | null;
}

function isVideo(url: string) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(url);
}

export function DisciplineSheet({ open, onClose, discipline }: DisciplineSheetProps) {
  const t = useTranslations("feed");
  const videoRef = useRef<HTMLVideoElement>(null);
  const dragY = useMotionValue(0);
  const backdropOpacity = useTransform(dragY, [0, 300], [1, 0]);

  useEffect(() => {
    if (open && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
    if (!open && videoRef.current) {
      videoRef.current.pause();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      if (info.offset.y > 150 || info.velocity.y > 500) {
        onClose();
      }
      dragY.set(0);
    },
    [onClose, dragY],
  );

  const d = discipline;
  if (!d) return null;

  const Icon = d.icon ? getIconComponent(d.icon) : null;
  const accent = d.color || "#475569";
  const media = d.mediaUrl;
  const hasVideo = media && isVideo(media);
  const hasImage = media && !hasVideo;
  const tags = d.tags ?? [];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            style={{ opacity: backdropOpacity }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Mobile: bottom sheet, Desktop: centered modal */}
          <motion.div
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.8 }}
            onDrag={(_, info) => dragY.set(Math.max(0, info.offset.y))}
            onDragEnd={handleDragEnd}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 350 }}
            className={cn(
              "fixed inset-x-0 bottom-0 z-[61] flex h-[85dvh] flex-col overflow-hidden rounded-t-3xl bg-card",
              "lg:inset-auto lg:left-1/2 lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2",
              "lg:h-auto lg:max-h-[90vh] lg:w-full lg:max-w-lg lg:rounded-3xl",
            )}
          >
            {/* Drag handle (mobile) */}
            <div className="absolute left-0 right-0 top-0 z-20 flex justify-center pt-2 lg:hidden">
              <div className="h-1 w-10 rounded-full bg-white/40" />
            </div>

            {/* Media area — fills available space, content always visible */}
            <div className="relative w-full flex-1 overflow-hidden rounded-t-3xl bg-black lg:flex-none lg:aspect-video">
              {hasVideo && (
                <video
                  ref={videoRef}
                  src={media}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="h-full w-full object-cover"
                />
              )}
              {hasImage && (
                <img src={media} alt={d.name} className="h-full w-full object-cover" />
              )}
              {!media && (
                <div
                  className="flex h-full w-full items-center justify-center"
                  style={{ backgroundColor: accent }}
                >
                  {Icon ? (
                    <Icon className="h-20 w-20 text-white/30" />
                  ) : (
                    <Dumbbell className="h-20 w-20 text-white/30" />
                  )}
                </div>
              )}

              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Title overlay on media */}
              <div className="absolute bottom-0 left-0 right-0 px-5 pb-5">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-lg"
                    style={{ backgroundColor: accent }}
                  >
                    {Icon ? <Icon className="h-5 w-5" /> : <Dumbbell className="h-5 w-5" />}
                  </div>
                  <h2 className="font-display text-2xl font-bold text-white drop-shadow-lg">
                    {d.name}
                  </h2>
                </div>
              </div>
            </div>

            {/* Content + CTA — compact, shrink-0 so media gets priority */}
            <div className="shrink-0 space-y-3 px-5 pb-8 pt-4">
              {/* Quick stats + tags inline */}
              <div className="flex flex-wrap items-center gap-2">
                {d.duration && (
                  <div className="flex items-center gap-1 rounded-full bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-foreground">
                    <Clock className="h-3 w-3 text-muted" />
                    {d.duration} min
                  </div>
                )}
                {d.level && (
                  <div className="flex items-center gap-1 rounded-full bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-foreground">
                    <BarChart3 className="h-3 w-3 text-muted" />
                    {t(`levelLabels.${d.level}`) ?? d.level}
                  </div>
                )}
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
                    style={{ borderColor: `${accent}30`, color: accent, backgroundColor: `${accent}08` }}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Description */}
              {d.description && (
                <p className="text-[13px] leading-relaxed text-foreground/70">
                  {d.description}
                </p>
              )}

              {/* CTA */}
              <Link
                href={`/schedule?discipline=${encodeURIComponent(d.name)}`}
                onClick={onClose}
                className="group flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[15px] font-bold text-white transition-all hover:brightness-110 active:scale-[0.98]"
                style={{ backgroundColor: accent }}
              >
                {t("bookDiscipline", { name: d.name })}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
