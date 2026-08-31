const PRINT_PORTAL_CLASS = "app-print-portal";
const PRINT_DOCUMENT_CLASS = "app-print-document";
const PRINT_CLEANUP_TIMEOUT_MS = 10 * 60 * 1000;
let activePrintCleanup: (() => void) | null = null;

/**
 * Copies one rendered document template into an isolated body-level print root.
 * Browser printing otherwise captures the surrounding page and dialog chrome.
 */
export function printDocumentElement(target: HTMLElement | null): boolean {
  if (!target) return false;

  activePrintCleanup?.();
  document
    .querySelectorAll<HTMLElement>(`.${PRINT_PORTAL_CLASS}`)
    .forEach((stalePortal) => stalePortal.remove());

  const portal = document.createElement("div");
  portal.className = PRINT_PORTAL_CLASS;
  portal.setAttribute("aria-hidden", "true");

  const printableDocument = target.cloneNode(true) as HTMLElement;
  printableDocument.removeAttribute("id");
  printableDocument.classList.add(PRINT_DOCUMENT_CLASS);
  portal.append(printableDocument);
  document.body.append(portal);

  const cleanup = () => {
    window.removeEventListener("afterprint", cleanup);
    window.clearTimeout(cleanupTimer);
    portal.remove();
    if (activePrintCleanup === cleanup) activePrintCleanup = null;
  };

  activePrintCleanup = cleanup;
  window.addEventListener("afterprint", cleanup, { once: true });
  const cleanupTimer = window.setTimeout(cleanup, PRINT_CLEANUP_TIMEOUT_MS);

  try {
    window.print();
  } catch (error) {
    cleanup();
    throw error;
  }

  return true;
}
