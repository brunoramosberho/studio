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
import { prisma } from "@/lib/db";

export const metadata = {
  title: "Paquetes",
  description: "Paquetes de clases. Encuentra el plan perfecto para tu ritmo.",
};

function buildFeatures(pkg: {
  credits: number | null;
  validDays: number;
  price: number;
  currency: string;
}) {
  const features: string[] = [];

  if (pkg.credits) {
    const perClass = formatCurrency(Math.round(pkg.price / pkg.credits), pkg.currency);
    features.push(`${pkg.credits} ${pkg.credits === 1 ? "clase" : "clases"} (${perClass} c/u)`);
  } else {
    features.push("Clases ilimitadas");
  }

  features.push(`Válido por ${pkg.validDays} días`);
  features.push("Cualquier modalidad");

  if (pkg.credits && pkg.credits >= 10) features.push("Reserva prioritaria");

  return features;
}

export default async function PackagesPage() {
  const packages = await prisma.package.findMany({
    where: { isActive: true },
    orderBy: { price: "asc" },
  });

  const maxCredits = Math.max(...packages.filter((p) => p.credits).map((p) => p.credits!));
  const popularPkg = packages.find(
    (p) => p.credits && p.credits >= 10 && p.credits < maxCredits,
  );

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
          {packages.map((pkg) => {
            const isPopular = popularPkg?.id === pkg.id;
            const features = buildFeatures(pkg);

            return (
              <Card
                key={pkg.id}
                className={`relative flex flex-col transition-all duration-300 hover:shadow-[var(--shadow-warm-md)] hover:-translate-y-1 ${
                  isPopular
                    ? "border-2 border-accent shadow-[var(--shadow-warm-lift)] sm:scale-105"
                    : ""
                } ${pkg.isPromo ? "border-2 border-dashed border-accent/40" : ""}`}
              >
                {isPopular && (
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
                  {pkg.description && (
                    <CardDescription className="text-xs font-medium uppercase tracking-wider text-accent">
                      {pkg.description}
                    </CardDescription>
                  )}
                  <CardTitle className="text-xl">{pkg.name}</CardTitle>
                </CardHeader>

                <CardContent className="flex flex-1 flex-col">
                  <div className="mb-6">
                    <span className="font-mono text-4xl font-medium text-foreground">
                      {formatCurrency(pkg.price, pkg.currency)}
                    </span>
                    {pkg.credits && (
                      <span className="ml-1 text-sm text-muted">
                        / {pkg.credits} {pkg.credits === 1 ? "clase" : "clases"}
                      </span>
                    )}
                  </div>

                  <ul className="flex-1 space-y-3">
                    {features.map((feature) => (
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
                      variant={isPopular ? "default" : "secondary"}
                    >
                      <Link href="/login">
                        {pkg.isPromo ? "Probar ahora" : "Comprar"}
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
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
