"use client";

import { useRouter } from "next/navigation";
import { AppPageHeader, DocumentFormFrame } from "@/components/surface";
import { WasteOperationalForm } from "@/(protected)/inventory/waste/waste-operational-form";
import type { WasteFormContext } from "@lib/inventory/waste-create-model";
import { messages } from "@lib/messages";

export function WasteCreateClient({ context }: { context: WasteFormContext }) {
  const router = useRouter();
  const copy = messages.inventory.waste.operational;

  return (
    <DocumentFormFrame
      header={
        <AppPageHeader
          title={copy.title}
          meta={context.branch.name}
        />
      }
      width="wide"
      density="compact"
    >
      <WasteOperationalForm
        context={context}
        cancelHref={`/inventory/consumption?view=waste&branch=${context.branch.id}`}
        onCreated={(issueId) => router.push(`/inventory/issues/${issueId}`)}
      />
    </DocumentFormFrame>
  );
}
