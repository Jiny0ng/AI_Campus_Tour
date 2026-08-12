"use client";

import type { ComponentProps } from "react";
import { SearchBar } from "@/components/Common";

type SearchInputProps = ComponentProps<typeof SearchBar>;

export function SearchInput(props: SearchInputProps) {
  return <SearchBar {...props} />;
}
