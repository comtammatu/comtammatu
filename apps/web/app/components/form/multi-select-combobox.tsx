"use client";

import {
  MultiSelectCombobox as SharedMultiSelectCombobox,
  type MultiSelectComboboxOption,
  type MultiSelectComboboxProps as SharedMultiSelectComboboxProps,
} from "@comtammatu/ui/components/combobox";
import { matchesSearch } from "@lib/search";

export type MultiSelectComboboxProps = Omit<
  SharedMultiSelectComboboxProps,
  "filter"
>;

export function MultiSelectCombobox(props: MultiSelectComboboxProps) {
  return (
    <SharedMultiSelectCombobox
      {...props}
      filter={(option: MultiSelectComboboxOption, query) =>
        matchesSearch(
          [option.label, option.value, ...(option.keywords ?? [])],
          query,
        )
      }
    />
  );
}
