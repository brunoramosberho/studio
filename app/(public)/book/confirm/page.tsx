import { ConfirmationScreen } from "@/components/booking/confirmation-screen";

export const metadata = {
  title: "Reserva confirmada",
};

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const getString = (key: string): string | undefined => {
    const val = params[key];
    return typeof val === "string" ? val : undefined;
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-8 sm:py-16">
      <ConfirmationScreen
        classTitle={getString("classTitle")}
        classDate={getString("classDate")}
        classTime={getString("classTime")}
        coachName={getString("coachName")}
        startsAt={getString("startsAt")}
        endsAt={getString("endsAt")}
        location={getString("location")}
      />
    </div>
  );
}
