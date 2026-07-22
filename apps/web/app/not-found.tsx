import { NotFoundPanel } from "@/components/not-found-panel";

export default function RootNotFound() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-dvh items-center justify-center p-4"
    >
      <div className="w-full max-w-xl">
        <NotFoundPanel />
      </div>
    </main>
  );
}
