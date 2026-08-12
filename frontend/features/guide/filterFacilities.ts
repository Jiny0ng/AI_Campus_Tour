import type { Facility } from "@/types";

export function filterFacilities(facilities: Facility[], keyword: string) {
  const normalizedKeyword = keyword.trim().toLowerCase();

  if (!normalizedKeyword) {
    return facilities;
  }

  return facilities.filter((facility) =>
    [facility.name, facility.category, facility.floor]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedKeyword)),
  );
}
