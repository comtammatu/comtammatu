/**
 * Finance LIST/REPORT filter widths on the named spacing scale
 * (design-system.md § Token Contract: no arbitrary dimensions).
 * Mobile keeps a max-w cap so wrapped toolbars stay compact before the
 * sm: fixed width takes over.
 */

/** Period Select trigger: "Tháng này / Tháng trước" labels. */
export const financeFilterRangeTriggerClassName = "w-full sm:w-32";

/** Calendar period picker trigger: longest display is a dated week range. */
export const financeFilterPeriodPickerClassName = "w-full sm:w-64";

/** Custom from/to day picker: `dd/mm/yyyy` plus calendar icon. */
export const financeFilterDatePickerClassName = "w-full sm:w-36";

/** Granularity Select trigger: Ngày / Tuần / Tháng. */
export const financeFilterGranularityTriggerClassName = "w-full sm:w-36";

/** Compare-mode Select trigger: longest label is "Cùng tháng trước". */
export const financeFilterCompareTriggerClassName = "w-full sm:w-44";

/** Bank LIST reconciliation Select: longest label is "Thiếu bằng chứng NH". */
export const financeFilterReconTriggerClassName = "w-full sm:w-44";
