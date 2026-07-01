import * as React from "react";
import { Slot as RadixSlot } from "radix-ui";

const Slot = React.forwardRef<
  React.ElementRef<typeof RadixSlot.Root>,
  React.ComponentPropsWithoutRef<typeof RadixSlot.Root>
>((props, ref) => <RadixSlot.Root ref={ref} {...props} />);
Slot.displayName = "Slot";

export { Slot };
