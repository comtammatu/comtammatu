import { PageSkeleton } from "@/components/page-skeleton";

export default function Loading() {
  return <PageSkeleton width="narrow" density="compact" mobile blocks={3} />;
}
