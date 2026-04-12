"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  StudioMap,
  type SpotInfo,
  type RoomLayoutData,
} from "@/components/shared/studio-map";

interface SpotPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  className?: string;
  onSpotSelected: (spotNumber: number) => void;
  onSkip: () => void;
}

export function SpotPicker({
  open,
  onOpenChange,
  classId,
  className: classLabel,
  onSpotSelected,
  onSkip,
}: SpotPickerProps) {
  const [selectedSpot, setSelectedSpot] = useState<number | null>(null);

  const { data, isLoading } = useQuery<{
    hasLayout: boolean;
    layout?: RoomLayoutData;
    maxCapacity?: number;
    spotMap?: Record<number, SpotInfo>;
    coachName?: string;
  }>({
    queryKey: ["pos-class-spots", classId],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/pos/class-spots?classId=${classId}`,
      );
      if (!res.ok) return { hasLayout: false };
      return res.json();
    },
    enabled: open && !!classId,
    staleTime: 10_000,
  });

  function handleConfirm() {
    if (selectedSpot) {
      onSpotSelected(selectedSpot);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Seleccionar lugar
          </DialogTitle>
        </DialogHeader>

        {classLabel && (
          <p className="text-sm text-muted">{classLabel}</p>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted" />
          </div>
        ) : !data?.hasLayout ? (
          <p className="py-8 text-center text-sm text-muted">
            Esta sala no tiene layout configurado.
          </p>
        ) : (
          <div className="py-2">
            <StudioMap
              maxCapacity={data.maxCapacity!}
              spotMap={data.spotMap ?? {}}
              selectedSpot={selectedSpot}
              onSelectSpot={setSelectedSpot}
              layout={data.layout}
              coachName={data.coachName}
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onSkip}
          >
            Sin lugar asignado
          </Button>
          <Button
            size="sm"
            className="bg-admin text-white hover:bg-admin/90"
            onClick={handleConfirm}
            disabled={!selectedSpot}
          >
            Confirmar lugar {selectedSpot && `#${selectedSpot}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
