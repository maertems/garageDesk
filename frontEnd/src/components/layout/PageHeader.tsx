import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: string;
  back?: { href: string; label?: string };
  search?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({ title, description, back, search, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("border-b bg-card", className)}>
      <div className="px-6 py-4 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          {back && (
            <Link
              href={back.href}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              {back.label ?? "Retour"}
            </Link>
          )}
          <h1 className="text-xl font-semibold tracking-tight truncate">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        {search && <div className="shrink-0 w-72">{search}</div>}
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}

export function PageBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("p-6", className)}>{children}</div>;
}
