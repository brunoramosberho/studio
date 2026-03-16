import type { Metadata } from "next";
import Link from "next/link";
import {
  Star,
  CheckCircle2,
  CalendarCheck,
  Sparkles,
  Gift,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { PageTransition } from "@/components/shared/page-transition";

export const metadata: Metadata = {
  title: "Paquetes",
  description:
    "Paquetes de clases de Pilates, Barre y Mat Flow en Flō Studio. Encuentra el plan perfecto para tu ritmo.",
};

const packages = [
  {
    name: "Primera Vez",
    description: "Tu primera experiencia en Flō",
    price: 150,
    credits: 1,
    validDays: 7,
    isPromo: true,
    isPopular: false,
    features: ["1 clase de cualquier modalidad", "Válido por 7 días", "Solo nuevas clientas"],
  },
  {
    name: "Clase Individual",
    description: "Para cuando quieras algo puntual",
    price: 450,
    credits: 1,
    validDays: 30,
    isPromo: false,
    isPopular: false,
    features: ["1 clase de cualquier modalidad", "Válido por 30 días", "Sin compromiso"],
  },
  {
    name: "Pack 5 Clases",
    description: "Empieza a crear el hábito",
    price: 1800,
    credits: 5,
    validDays: 45,
    isPromo: false,
    isPopular: false,
    features: ["5 clases ($360 c/u)", "Válido por 45 días", "Cualquier modalidad"],
  },
  {
    name: "Pack 10 Clases",
    description: "El favorito de nuestras clientas",
    price: 2800,
    credits: 10,
    validDays: 60,
    isPromo: false,
    isPopular: true,
    features: ["10 clases ($280 c/u)", "Válido por 60 días", "Cualquier modalidad", "1 clase de regalo"],
  },
  {
    name: "Pack 20 Clases",
    description: "Para las más dedicadas",
    price: 4800,
    credits: 20,
    validDays: 90,
    isPromo: false,
    isPopular: false,
    features: ["20 clases ($240 c/u)", "Válido por 90 días", "Cualquier modalidad", "Reserva prioritaria"],
  },
  {
    name: "Ilimitado Mensual",
    description: "Experiencia completa sin límites",
    price: 3900,
    credits: null,
    validDays: 30,
    isPromo: false,
    isPopular: false,
    features: ["Clases ilimitadas", "Válido por 30 días", "Todas las modalidades", "Reserva prioritaria", "Invita a una amiga/mes"],
  },
  {
    name: "Ilimitado Trimestral",
    description: "El mejor precio por clase",
    price: 9900,
    credits: null,
    validDays: 90,
    isPromo: false,
    isPopular: false,
    features: ["Clases ilimitadas", "Válido por 90 días", "Todas las modalidades", "Reserva prioritaria", "Invita a una amiga/mes", "10% en retail"],
  },
];

export default function PackagesPage() {
  return (
    <PageTransition>
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <h1 className="font-display text-4xl font-bold text-foreground sm:text-5xl">
            Paquetes
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-lg text-muted">
            Elige el plan que se adapte a tu ritmo. Todas las modalidades incluidas.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {packages.map((pkg) => (
            <Card
              key={pkg.name}
              className={`relative flex flex-col transition-all duration-300 hover:shadow-[var(--shadow-warm-md)] hover:-translate-y-1 ${
                pkg.isPopular
                  ? "border-2 border-accent shadow-[var(--shadow-warm-lift)] sm:scale-105"
                  : ""
              } ${pkg.isPromo ? "border-2 border-dashed border-accent/40" : ""}`}
            >
              {pkg.isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-accent text-white shadow-[var(--shadow-warm)]">
                    <Star className="mr-1 h-3 w-3" /> Más popular
                  </Badge>
                </div>
              )}
              {pkg.isPromo && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-accent/10 text-accent shadow-[var(--shadow-warm)]">
                    <Gift className="mr-1 h-3 w-3" /> Promo
                  </Badge>
                </div>
              )}

              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-medium uppercase tracking-wider text-accent">
                  {pkg.description}
                </CardDescription>
                <CardTitle className="text-xl">{pkg.name}</CardTitle>
              </CardHeader>

              <CardContent className="flex flex-1 flex-col">
                <div className="mb-6">
                  <span className="font-mono text-4xl font-medium text-foreground">
                    {formatCurrency(pkg.price)}
                  </span>
                  {pkg.credits && (
                    <span className="ml-1 text-sm text-muted">
                      / {pkg.credits} {pkg.credits === 1 ? "clase" : "clases"}
                    </span>
                  )}
                </div>

                <ul className="flex-1 space-y-3">
                  {pkg.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm text-muted"
                    >
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <div className="mt-8 flex items-center gap-2 text-xs text-muted/60">
                  <CalendarCheck className="h-3.5 w-3.5" />
                  Vigencia: {pkg.validDays} días
                </div>

                <div className="mt-4">
                  <Button
                    asChild
                    className="w-full"
                    variant={pkg.isPopular ? "default" : "secondary"}
                  >
                    <Link href="/login">
                      {pkg.isPromo ? "Probar ahora" : "Comprar"}
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mx-auto mt-16 max-w-2xl rounded-2xl bg-surface/80 p-8 text-center">
          <Sparkles className="mx-auto mb-4 h-8 w-8 text-accent" />
          <h3 className="font-display text-xl font-bold text-foreground">
            ¿No sabes cuál elegir?
          </h3>
          <p className="mt-2 text-sm text-muted">
            Escríbenos y te ayudamos a encontrar el paquete perfecto para tus
            objetivos.
          </p>
          <Button asChild variant="default" className="mt-6">
            <Link href="/schedule">Ver horarios</Link>
          </Button>
        </div>
      </div>
    </PageTransition>
  );
}
