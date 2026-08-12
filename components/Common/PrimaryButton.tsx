"use client";

import type { ComponentProps } from "react";
import { Button } from "./Button";

type PrimaryButtonProps = ComponentProps<typeof Button>;

export function PrimaryButton(props: PrimaryButtonProps) {
  return <Button size="lg" {...props} />;
}
