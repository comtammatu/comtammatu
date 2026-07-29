const status = "new_status";
const label = STATUS_LABELS[status] ?? status;
const technicalCopy = "Mất lock, vui lòng thử lại";
const leakedQueueCopy = "Quay lại inbox";
const leakedIdentifierCopy = "Session ID không hợp lệ";
toast.error(
  error.message,
);
const detail = <p>{error.digest}</p>;
