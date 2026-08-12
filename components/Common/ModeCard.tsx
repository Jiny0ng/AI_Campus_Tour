import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

type ModeCardProps = {
  imageSrc: string;
  title: string;
  description: string;
  selected?: boolean;
  className?: string;
};

export function ModeCard({ imageSrc, title, description, selected = false, className }: ModeCardProps) {
  return (
    <article
      className={cn(
        "overflow-hidden rounded-card border bg-surface shadow-card transition active:scale-[0.99]",
        selected ? "border-primary bg-primary-soft" : "border-line",
        className,
      )}
    >
      <div className="relative aspect-[16/9] w-full">
        <Image src={imageSrc} alt="" fill className="object-cover" sizes="100vw" />
      </div>
      <div className="flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="truncate text-base font-bold text-ink">{title}</h2>
          <p className="truncate text-xs text-muted">{description}</p>
        </div>
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", selected ? "bg-primary text-white" : "bg-page text-ink")}>
          <ChevronRight size={18} />
        </span>
      </div>
    </article>
  );
}
