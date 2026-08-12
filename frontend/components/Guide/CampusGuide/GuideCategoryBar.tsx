"use client";

import { CircleParking, Coffee, Store, Utensils } from "lucide-react";
import { Chip, ChipGroup } from "@/components/Common";
import type { GuideCategory, GuidePlaceCategory } from "@/types";

type GuideCategoryBarProps = {
  categories: GuideCategory[];
  selectedCategory?: GuidePlaceCategory;
  onSelectCategory: (category: GuidePlaceCategory) => void;
};

const iconMap = {
  parking: CircleParking,
  cafe: Coffee,
  convenience: Store,
  cafeteria: Utensils,
};

export function GuideCategoryBar({
  categories,
  selectedCategory,
  onSelectCategory,
}: GuideCategoryBarProps) {
  return (
    <ChipGroup className="-mx-0 px-0">
      {categories.map((category) => {
        const Icon = iconMap[category.id];

        return (
          <Chip
            key={category.id}
            selected={selectedCategory === category.id}
            icon={<Icon size={15} />}
            onClick={() => onSelectCategory(category.id)}
            className="h-9 bg-surface px-4 text-sm shadow-floating"
          >
            {category.label}
          </Chip>
        );
      })}
    </ChipGroup>
  );
}
