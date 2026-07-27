const status = "new_status";
const label = STATUS_LABELS[status] ?? status;
const technicalCopy = "Mất lock, vui lòng thử lại";
toast.error(
  error.message,
);
const detail = <p>{error.digest}</p>;
