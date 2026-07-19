"use client";

import { forwardRef } from "react";
import {
  Combobox as SharedCombobox,
  type ComboboxOption,
  type ComboboxProps as SharedComboboxProps,
} from "@comtammatu/ui/components/combobox";
import { matchesSearch } from "@lib/search";

export type ComboboxProps = Omit<SharedComboboxProps, "filter">;

export const Combobox = forwardRef<HTMLButtonElement, ComboboxProps>(
  function Combobox(props, ref) {
    return (
      <SharedCombobox
        {...props}
        ref={ref}
        filter={(option: ComboboxOption, query) =>
          matchesSearch(
            [option.label, option.value, ...(option.keywords ?? [])],
            query,
          )
        }
      />
    );
  },
);

Combobox.displayName = "Combobox";
