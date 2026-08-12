import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type LoadingProps = {
  label?: string;
  fullScreen?: boolean;
  className?: string;
};

export function Loading({ label = "불러오는 중", fullScreen = false, className }: LoadingProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-muted",
        fullScreen ? "min-h-dvh" : "py-10",
        className,
      )}
    >
      <Loader2 size={28} className="animate-spin text-primary" />
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}
