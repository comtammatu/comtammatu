import type { CartItem, CartModifier, CartSide, DeliveryPlatform, OrderType } from "../types";
import type { MenuItem } from "../pos-menu-types";
import { makeCartKey, makeNotedCartKey } from "../_utils/cart-key";

export type CartSnapshot = {
  items: CartItem[];
  note: string;
  orderType: OrderType;
  deliveryPlatform: DeliveryPlatform | null;
  externalOrderRef: string;
};

type Listener = () => void;

export class CartStore {
  private state: CartSnapshot;
  private listeners = new Set<Listener>();

  constructor(initial?: Partial<CartSnapshot>) {
    this.state = {
      items: initial?.items ?? [],
      note: initial?.note ?? "",
      orderType: initial?.orderType ?? "takeaway",
      deliveryPlatform: initial?.deliveryPlatform ?? null,
      externalOrderRef: initial?.externalOrderRef ?? "",
    };
    this.subscribe = this.subscribe.bind(this);
    this.getSnapshot = this.getSnapshot.bind(this);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): CartSnapshot {
    return this.state;
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  private setState(next: CartSnapshot) {
    this.state = next;
    this.emit();
  }

  addItem(
    item: MenuItem,
    opts: {
      variantId?: number;
      variantName?: string;
      unitPrice?: number;
      modifiers?: CartModifier[];
      sides?: CartSide[];
      note?: string;
      quantity?: number;
      discountType?: "vnd";
      discountValue?: number;
      discountNote?: string;
    } = {},
  ) {
    const modifiers = opts.modifiers ?? [];
    const sides = opts.sides ?? [];
    const price = opts.unitPrice ?? item.base_price;
    const hasNote = opts.note !== undefined && opts.note.length > 0;
    const hasDiscount =
      opts.discountType === "vnd" && opts.discountValue !== undefined;
    const quantity = opts.quantity ?? 1;
    const baseKey = makeCartKey(item.id, opts.variantId, modifiers, sides);
    // A discounted line gets a unique key so it never quantity-merges onto an
    // identical undiscounted line (same as a noted line).
    const key = hasNote || hasDiscount ? makeNotedCartKey(baseKey) : baseKey;

    const items = this.state.items;
    if (!hasNote && !hasDiscount) {
      const existing = items.find((ci) => ci.key === key);
      if (existing) {
        this.setState({
          ...this.state,
          items: items.map((ci) =>
            ci.key === key ? { ...ci, quantity: ci.quantity + quantity } : ci,
          ),
        });
        return;
      }
    }

    const newItem: CartItem = {
      key,
      menu_item_id: item.id,
      item_name: item.name,
      variant_id: opts.variantId,
      variant_name: opts.variantName,
      quantity,
      unit_price: price,
      modifiers,
      sides,
      note: hasNote ? opts.note : undefined,
      discount_type: hasDiscount ? opts.discountType : undefined,
      discount_value: hasDiscount ? opts.discountValue : undefined,
      discount_note: hasDiscount ? opts.discountNote : undefined,
    };
    this.setState({ ...this.state, items: [...items, newItem] });
  }

  updateQuantity(key: string, delta: number) {
    this.setState({
      ...this.state,
      items: this.state.items
        .map((ci) =>
          ci.key === key ? { ...ci, quantity: ci.quantity + delta } : ci,
        )
        .filter((ci) => ci.quantity > 0),
    });
  }

  removeItem(key: string) {
    this.setState({
      ...this.state,
      items: this.state.items.filter((ci) => ci.key !== key),
    });
  }

  clear() {
    this.setState({
      ...this.state,
      items: [],
      note: "",
      deliveryPlatform: null,
      externalOrderRef: "",
    });
  }

  setNote(note: string) {
    this.setState({ ...this.state, note });
  }

  setOrderType(orderType: OrderType) {
    const next: CartSnapshot = { ...this.state, orderType };
    if (orderType !== "delivery") {
      next.deliveryPlatform = null;
      next.externalOrderRef = "";
    }
    this.setState(next);
  }

  setDeliveryPlatform(deliveryPlatform: DeliveryPlatform | null) {
    this.setState({ ...this.state, deliveryPlatform });
  }

  setExternalOrderRef(externalOrderRef: string) {
    this.setState({ ...this.state, externalOrderRef });
  }

  replaceItems(items: CartItem[]) {
    this.setState({ ...this.state, items });
  }
}
