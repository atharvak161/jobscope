import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "bg-slate-100 text-slate-700",
        confirmed: "bg-emerald-100 text-emerald-700 border border-emerald-200",
        likely: "bg-amber-100 text-amber-700 border border-amber-200",
        unknown: "bg-slate-100 text-slate-500 border border-slate-200",
        danger: "bg-red-100 text-red-700 border border-red-200",
        warning: "bg-amber-100 text-amber-700 border border-amber-200",
        outline: "border border-slate-200 text-slate-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
