import type { Metadata } from "next";
import { ScheduleClient } from "./schedule-client";

export const metadata: Metadata = {
  title: "Horarios",
  description:
    "Consulta los horarios de clases de Pilates, Barre y Mat Flow en Flō Studio. Reserva tu lugar.",
};

export default function SchedulePage() {
  return <ScheduleClient />;
}
