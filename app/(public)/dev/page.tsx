"use client";

import { Shield, Dumbbell, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageTransition } from "@/components/shared/page-transition";

const roles = [
  {
    role: "ADMIN",
    label: "Admin",
    description: "Dashboard completo, gestión de clases, coaches, clientes, reportes",
    icon: Shield,
    color: "text-admin",
    bg: "bg-admin/10",
    href: "/api/dev/login?role=ADMIN",
  },
  {
    role: "COACH",
    label: "Coach",
    description: "Horario personal, asistencia de alumnos, perfil de coach",
    icon: Dumbbell,
    color: "text-coach",
    bg: "bg-coach/10",
    href: "/api/dev/login?role=COACH",
  },
  {
    role: "CLIENT",
    label: "Cliente",
    description: "Reservas, paquetes, historial, lista de espera, perfil",
    icon: User,
    color: "text-accent",
    bg: "bg-accent/10",
    href: "/api/dev/login?role=CLIENT",
  },
];

export default function DevLoginPage() {
  return (
    <PageTransition>
      <div className="flex min-h-[80dvh] items-center justify-center px-4">
        <div className="w-full max-w-lg">
          <div className="mb-10 text-center">
            <p className="mb-2 font-mono text-xs uppercase tracking-widest text-accent">
              Modo desarrollo
            </p>
            <h1 className="font-display text-4xl font-bold text-foreground">
              Elegir portal
            </h1>
            <p className="mt-2 text-sm text-muted">
              Inicia sesión como cualquier rol para explorar la app.
            </p>
          </div>

          <div className="space-y-4">
            {roles.map((r) => (
              <a key={r.role} href={r.href}>
                <Card className="cursor-pointer transition-all hover:scale-[1.02] hover:shadow-md">
                  <CardContent className="flex items-center gap-4 p-6">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${r.bg}`}>
                      <r.icon className={`h-6 w-6 ${r.color}`} />
                    </div>
                    <div className="flex-1">
                      <p className="font-display text-lg font-bold text-foreground">
                        {r.label}
                      </p>
                      <p className="text-sm text-muted">{r.description}</p>
                    </div>
                    <span className="font-mono text-xs text-muted">→</span>
                  </CardContent>
                </Card>
              </a>
            ))}
          </div>

          <p className="mt-8 text-center text-xs text-muted/60">
            Solo disponible en desarrollo.
          </p>
        </div>
      </div>
    </PageTransition>
  );
}
