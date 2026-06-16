export interface ComboboxFieldOption {
  value: string;
  label: string;
  /** Optional secondary text shown below label (e.g. SKU, unit) */
  hint?: string;
  /** Tokens searched in addition to `label` (e.g. sku, category) */
  keywords?: string[];
  disabled?: boolean;
}
