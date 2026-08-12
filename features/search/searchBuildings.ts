import type { Building } from "@/types";

export function searchBuildings(buildings: Building[], keyword: string) {
  const normalizedKeyword = keyword.trim().toLowerCase();

  if (!normalizedKeyword) {
    return buildings;
  }

  return buildings.filter((building) =>
    [building.name, building.description, ...building.categories].some((value) =>
      value.toLowerCase().includes(normalizedKeyword),
    ),
  );
}
