import { PropsWithChildren } from "react";
import { cn } from "@/lib/cn";

type MobileShellProps = PropsWithChildren<{
  className?: string;
}>;

export function MobileShell({ className, children }: MobileShellProps) {
  return (
    <div className="min-h-dvh bg-page">
      <div
        className={cn(
          "mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-page",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
