import type { Office } from "@moldura/common";

export type OfficeOption = { office: Office; label: string };

export const OFFICE_OPTIONS: readonly OfficeOption[] = [
  { office: "presidente", label: "Presidente" },
  { office: "governador", label: "Governador" },
];
