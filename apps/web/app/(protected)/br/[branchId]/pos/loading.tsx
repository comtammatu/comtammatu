import { PageSpinner } from "@/components/page-skeleton";

export default function Loading() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <PageSpinner />
    </div>
  );
}

