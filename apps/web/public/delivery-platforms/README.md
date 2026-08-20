# Third-party delivery platform marks

`DeliveryPlatformMark` renders inline SVG identification badges (Grab / Shopee /
be / Green SM) so POS/KDS/Pickup never depend on a public URL fetch.

Optional files here (`grab.svg`, `shopee.svg`, `be.svg`, `green_sm.svg`) may
hold official partner marks when a license allows embedding; they are not
wired by default. Do not route these through `/brand/` or `BrandMark`.

Thermal print and TTS stay text only.
