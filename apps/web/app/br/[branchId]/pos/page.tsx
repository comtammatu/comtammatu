import { ShoppingCart } from "lucide-react";

export default function PosPage() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <ShoppingCart className="mx-auto size-16 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-bold">POS — Điểm bán hàng</h1>
        <p className="mt-2 text-muted-foreground">
          Giao diện bán hàng sẽ có trong M2 (POS).
        </p>
      </div>
    </div>
  );
}
