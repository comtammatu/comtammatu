import { PageSkeleton } from "@/components/page-skeleton";

export default function Loading() {
  return <PageSkeleton bare toolbar={false} blocks={2} />;
}
