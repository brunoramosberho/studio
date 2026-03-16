import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-3 py-0.5 text-xs font-medium font-body transition-colors",
  {
    variants: {
      variant: {
        default: "bg-accent/10 text-accent",
        secondary: "bg-surface text-muted",
        level: "bg-accent-soft/50 text-accent",
        success: "bg-green-50 text-green-700",
        warning: "bg-orange-50 text-orange-600",
        danger: "bg-red-50 text-destructive",
        coach: "bg-coach/10 text-coach",
        admin: "bg-admin/10 text-admin",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
