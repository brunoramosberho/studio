import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Heart } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageTransition } from "@/components/shared/page-transition";

export const metadata: Metadata = {
  title: "Nuestros Coaches",
  description:
    "Conoce a las coaches de Flō Studio. Expertas certificadas en Pilates, Barre y bienestar.",
};

const coaches = [
  {
    id: "valentina",
    name: "Valentina Reyes",
    bio: "Certificada en STOTT Pilates con más de 8 años de experiencia transformando cuerpos y mentes. Especialista en rehabilitación y trabajo pre/postnatal, Valentina crea un espacio seguro donde cada alumna progresa a su ritmo.",
    specialties: ["Reformer", "Pre/Postnatal", "Rehabilitación"],
    image: null,
  },
  {
    id: "carolina",
    name: "Carolina Mendoza",
    bio: "Bailarina profesional convertida en instructora de Mat Pilates y flexibilidad. Con formación en danza contemporánea, Carolina integra fluidez y gracia en cada clase, haciendo que el movimiento se sienta como poesía.",
    specialties: ["Mat Flow", "Flexibility", "Danza"],
    image: null,
  },
  {
    id: "isabela",
    name: "Isabela Torres",
    bio: "Ex atleta olímpica que encontró su pasión en la enseñanza de Barre y fuerza funcional. Sus clases son desafiantes pero accesibles, diseñadas para que cada alumna se sienta poderosa al salir del studio.",
    specialties: ["Barre Fusion", "Strength", "HIIT Pilates"],
    image: null,
  },
];

export default function CoachesPage() {
  return (
    <PageTransition>
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <h1 className="font-display text-4xl font-bold text-foreground sm:text-5xl">
            Nuestros Coaches
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-lg text-muted">
            Expertas apasionadas y certificadas que te guiarán en cada
            movimiento.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {coaches.map((coach) => (
            <Card
              key={coach.id}
              className="group overflow-hidden transition-all duration-300 hover:shadow-[var(--shadow-warm-md)]"
            >
              <div className="aspect-[3/4] bg-gradient-to-br from-accent/10 via-surface to-accent-soft/20">
                <div className="flex h-full items-center justify-center">
                  <div className="flex h-28 w-28 items-center justify-center rounded-full bg-accent/10 transition-transform group-hover:scale-110">
                    <Heart className="h-12 w-12 text-accent/40" />
                  </div>
                </div>
              </div>

              <CardContent className="p-8">
                <h2 className="font-display text-2xl font-bold text-foreground">
                  {coach.name}
                </h2>

                <div className="mt-3 flex flex-wrap gap-2">
                  {coach.specialties.map((s) => (
                    <Badge key={s} variant="level">
                      {s}
                    </Badge>
                  ))}
                </div>

                <p className="mt-4 text-sm leading-relaxed text-muted">
                  {coach.bio}
                </p>

                <Link
                  href="/schedule"
                  className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-accent transition-colors hover:text-accent/80"
                >
                  Ver clases <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </PageTransition>
  );
}
