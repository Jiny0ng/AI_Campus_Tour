export type HomeServiceMode = "tour" | "guide";

export type HomeServiceOption = {
  id: HomeServiceMode;
  title: string;
  description: string;
  href: string;
};
