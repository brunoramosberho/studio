import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BookingFlow } from "@/components/booking/booking-flow";

export const metadata = {
  title: "Reservar clase",
};

export default async function BookPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;

  return (
    <div className="mx-auto max-w-lg px-4 py-8 pb-28 sm:py-16 sm:pb-16">
      <Link
        href="/schedule"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Horarios
      </Link>

      <h1 className="mb-8 font-display text-3xl font-bold text-foreground">
        Reservar clase
      </h1>

      <BookingFlow classId={classId} />
    </div>
  );
}
