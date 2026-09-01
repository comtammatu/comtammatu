import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GRAB_MENU_MAPPING,
  getGrabOrderLevelFreeItemDiscountTotal,
  normalizeMenuName,
  generateOrderUuid,
  transformGrabOrderPayload,
  matchMenuItem,
  parseMonetaryAmount,
  validateGrabMerchantForBranch,
  type GrabOrderRaw,
} from "../lib/grabfood/mapping";

const MOCK_GRAB_ORDER_REAL: GrabOrderRaw = {
  orderID: "001644320651-C8DYVFLKG2VUN2",
  displayID: "GF-725",
  merchant: {
    ID: "5-C8DTE75GUGJ3JT",
  },
  eater: {
    name: "Khách Hàng Grab",
    mobileNumber: "+84 900 000 000",
    comment: "",
  },
  cutlery: 2,
  itemInfo: {
    items: [
      {
        name: "Sườn Cốt Lết",
        itemID: "VNITE20260818044418231553",
        quantity: 1,
        comment: "Hi quán",
        fare: {
          priceDisplay: "63.000",
          originalItemPriceDisplay: "54.000",
          priceFloat: 63000,
        },
        modifierGroups: [
          {
            modifierGroupID: "VNMOG2026081911022801159",
            modifierGroupName: "Dụng Cụ Ăn Uống",
            modifiers: [
              {
                modifierID: "VNMOD20260819110228013409",
                modifierName: "Hộp, Muỗng, Nĩa",
                priceDisplay: "3.000",
                quantity: 1,
              },
            ],
          },
          {
            modifierGroupID: "VNMOG2026081911011906171",
            modifierGroupName: "Ăn kèm",
            modifiers: [
              {
                modifierID: "VNMOD20260821070648011245",
                modifierName: "Tóp mỡ",
                priceDisplay: "6.000",
                quantity: 1,
              },
            ],
          },
        ],
      },
    ],
  },
  fare: {
    subTotalDisplay: "63.000",
    totalDisplay: "63.000",
  },
  paymentMethod: "Cashless",
};

const MOCK_DB_ITEMS = [
  { id: 1, name: "Sườn Cốt Lết", base_price: 54000 },
  { id: 2, name: "Sườn Cọng", base_price: 78000 },
  { id: 3, name: "Sườn Một Gang", base_price: 120000 },
  { id: 4, name: "Canh Khổ Qua", base_price: 30000 },
  { id: 8, name: "Tóp Mỡ", base_price: 6000 },
  { id: 29, name: "Dụng Cụ Mang Về", base_price: 3000 },
];

test("GrabFood mapping: normalizeMenuName normalizes accents and case", () => {
  assert.equal(normalizeMenuName("Sườn Cốt Lết"), "suon cot let");
  assert.equal(normalizeMenuName("Trà đá"), "tra da");
  assert.equal(normalizeMenuName("Cơm Tấm Chả"), "com tam cha");
  assert.equal(GRAB_MENU_MAPPING["VNITE20260818044418231553"]?.name, "Sườn Cốt Lết");
  assert.equal(GRAB_MENU_MAPPING["VNITE20260818044418041272"]?.name, "Cơm Thêm");
  assert.equal(GRAB_MENU_MAPPING["VNMOD20260819110649013214"]?.name, "Cơm Thêm");
});

test("GrabFood mapping: generateOrderUuid creates deterministic valid UUID", () => {
  const uuid1 = generateOrderUuid("001644320651-C8DYVFLKG2VUN2");
  const uuid2 = generateOrderUuid("001644320651-C8DYVFLKG2VUN2");
  assert.equal(uuid1, uuid2);
  assert.match(uuid1, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test("GrabFood mapping: matchMenuItem finds exact ID in DB items", () => {
  const grabItem = {
    itemID: "VNITE20260818044418231553",
    name: "Sườn Cốt Lết",
    quantity: 1,
  };

  const matched = matchMenuItem(grabItem, MOCK_DB_ITEMS);
  assert.equal(matched.id, 1);
  assert.equal(matched.name, "Sườn Cốt Lết");
  assert.equal(matched.base_price, 54000);
});

test("GrabFood mapping: resolves Rau Má Sữa as a variant of Rau Má", () => {
  const catalog = [
    {
      id: 920,
      name: "Rau Má",
      base_price: 20000,
      channel_price: 25000,
      variants: [
        { id: 2701, name: "Rau Má Sữa", price_adjustment: 0 },
        { id: 2801, name: "Rau Má Đường", price_adjustment: 0 },
      ],
    },
  ];
  const transformed = transformGrabOrderPayload(
    {
      orderID: "test-grab-rau-ma-sua",
      displayID: "GF-TEST",
      itemInfo: {
        items: [
          {
            itemID: "VNITE20260818044418122792",
            name: "Rau Má Sữa",
            quantity: 1,
          },
        ],
      },
    },
    catalog,
  );

  assert.equal(transformed.items[0]?.menu_item_id, 920);
  assert.equal(transformed.items[0]?.variant_id, 2701);
  assert.equal(transformed.items[0]?.variant_name, "Rau Má Sữa");
});

test("GrabFood mapping: matchMenuItem throws explicit error on unknown unmapped item", () => {
  const unmappedGrabItem = {
    itemID: "VNITE99999999999999999999",
    name: "Món Lạ Chưa Từng Có",
    quantity: 1,
  };

  assert.throws(
    () => matchMenuItem(unmappedGrabItem, MOCK_DB_ITEMS),
    /chưa được ánh xạ trong thực đơn quán/i,
  );
});

test("GrabFood transformation: transforms real GF-725 order accurately with platform payment and sides mapping", () => {
  const transformed = transformGrabOrderPayload(MOCK_GRAB_ORDER_REAL, MOCK_DB_ITEMS);

  assert.equal(transformed.orderId, "001644320651-C8DYVFLKG2VUN2");
  assert.equal(transformed.displayId, "GF-725");
  assert.equal(transformed.merchantId, "5-C8DTE75GUGJ3JT");
  assert.equal(transformed.paymentMethod, "platform");
  assert.equal(transformed.grossItemTotal, 63000);
  assert.equal(transformed.posTotalAmount, 63000);

  // Customer note: Grab has no order-level notes (only item notes); orders.note stays null to avoid yellow KDS banner
  assert.equal(transformed.customerNote, null);

  // Items
  assert.equal(transformed.items.length, 1);
  const lineItem = transformed.items[0];
  assert.equal(lineItem?.menu_item_id, 1);
  assert.equal(lineItem?.item_name, "Sườn Cốt Lết");
  assert.equal(lineItem?.quantity, 1);
  assert.equal(lineItem?.unit_price, 63000); // 54000 + 3000 + 6000
  assert.equal(lineItem?.subtotal, 63000);
  assert.equal(lineItem?.note, "Hi quán");

  // Modifiers should be empty (converted to valid sides for RPC safety)
  assert.equal(lineItem?.modifiers.length, 0);

  // Sides should contain Dụng Cụ Mang Về and Tóp Mỡ
  assert.equal(lineItem?.sides.length, 2);
  assert.deepEqual(lineItem?.sides, [
    { side_item_id: 29, name: "Dụng Cụ Mang Về", price: 3000, quantity: 1 },
    { side_item_id: 8, name: "Tóp Mỡ", price: 6000, quantity: 1 },
  ]);
});

test("GrabFood transformation: handles customerNote as null since Grab only has item-level notes", () => {
  const orderWithComment: GrabOrderRaw = {
    ...MOCK_GRAB_ORDER_REAL,
    eater: {
      name: "Khách VIP",
      mobileNumber: "0909999888",
      comment: "Giao sảnh A giúp mình, tới nơi alo",
    },
  };

  const transformed = transformGrabOrderPayload(orderWithComment, MOCK_DB_ITEMS);
  assert.equal(transformed.customerNote, null);
});

test("GrabFood transformation: accurately maps 'Cơm Thêm' modifier variants into sides", () => {
  const dbItemsWithComThem = [
    ...MOCK_DB_ITEMS,
    {
      id: 22,
      name: "Cơm Thêm",
      base_price: 5000,
      channel_price: 7000,
    },
  ];

  const orderWithComThem: GrabOrderRaw = {
    ...MOCK_GRAB_ORDER_REAL,
    displayID: "GF-553",
    itemInfo: {
      items: [
        {
          name: "Sườn Cốt Lết",
          itemID: "VNITE20260818044418231553",
          quantity: 1,
          comment: "Không mỡ",
          fare: { priceDisplay: "60.000", priceFloat: 60000 },
          modifierGroups: [
            {
              modifierGroupID: "VNMOG2026081911064901111",
              modifierGroupName: "Món thêm",
              modifiers: [
                {
                  modifierID: "VNMOD20260819110649013214",
                  modifierName: "Cơm Thêm",
                  priceDisplay: "6.000",
                  quantity: 1,
                },
                {
                  modifierName: "Thêm cơm",
                  priceDisplay: "6.000",
                  quantity: 1,
                },
              ],
            },
          ],
        },
      ],
    },
  };

  const transformed = transformGrabOrderPayload(orderWithComThem, dbItemsWithComThem);
  const lineItem = transformed.items[0];
  assert.equal(lineItem?.item_name, "Sườn Cốt Lết");
  assert.equal(lineItem?.note, "Không mỡ"); // Note only contains item comment, no "Tùy chọn: Cơm Thêm"
  assert.equal(lineItem?.sides.length, 2);
  assert.equal(lineItem?.sides[0]?.side_item_id, 22);
  assert.equal(lineItem?.sides[0]?.name, "Cơm Thêm");
  assert.equal(lineItem?.sides[0]?.price, 7000);
  assert.equal(lineItem?.sides[1]?.side_item_id, 22);
  assert.equal(lineItem?.sides[1]?.name, "Cơm Thêm");
  assert.equal(lineItem?.sides[1]?.price, 7000);
  assert.equal(lineItem?.unit_price, 68000);
});

test("GrabFood transformation: supports standalone items (e.g. Bì ordered as a standalone dish)", () => {
  const dbItemsWithBi = [
    ...MOCK_DB_ITEMS,
    { id: 10, name: "Bì", base_price: 12000 },
  ];

  const orderWithStandaloneBi: GrabOrderRaw = {
    orderID: "001644320651-STANDALONE",
    displayID: "GF-726",
    merchant: { ID: "5-C8DTE75GUGJ3JT" },
    eater: { name: "Khách Lẻ", mobileNumber: "+84 900 000 000" },
    itemInfo: {
      items: [
        {
          name: "Bì",
          itemID: "VNITE20260818044418061788",
          quantity: 2,
          fare: { priceDisplay: "24.000", priceFloat: 24000 },
        },
      ],
    },
    fare: { subTotalDisplay: "24.000", totalDisplay: "24.000" },
  };

  const transformed = transformGrabOrderPayload(orderWithStandaloneBi, dbItemsWithBi);
  assert.equal(transformed.items.length, 1);
  const lineItem = transformed.items[0];
  assert.equal(lineItem?.menu_item_id, 10);
  assert.equal(lineItem?.item_name, "Bì");
  assert.equal(lineItem?.quantity, 2);
  assert.equal(lineItem?.unit_price, 12000);
  assert.equal(lineItem?.subtotal, 24000);
  assert.equal(lineItem?.modifiers.length, 0);
  assert.equal(lineItem?.sides.length, 0); // Standalone item has no sides
});

test("GrabFood transformation: assigns 100% item discount for 0đ free gift items", () => {
  const orderWithFreeGift: GrabOrderRaw = {
    orderID: "001644320651-FREEGIFT",
    displayID: "GF-169",
    itemInfo: {
      items: [
        {
          name: "Sườn Cốt Lết",
          itemID: "VNITE20260818044418231553",
          quantity: 1,
          fare: { priceDisplay: "63.000", priceFloat: 63000 },
        },
        {
          name: "Canh Khổ Qua",
          itemID: "VNITE20260818044418190698",
          quantity: 1,
          fare: { priceDisplay: "0", priceFloat: 0 },
        },
      ],
    },
    fare: { subTotalDisplay: "63.000", totalDisplay: "63.000" },
  };

  const transformed = transformGrabOrderPayload(orderWithFreeGift, MOCK_DB_ITEMS);
  assert.equal(transformed.items.length, 2);
  const paidItem = transformed.items[0];
  const freeItem = transformed.items[1];

  assert.equal(paidItem?.item_name, "Sườn Cốt Lết");
  assert.equal(paidItem?.discount_type, undefined);

  assert.equal(freeItem?.item_name, "Canh Khổ Qua");
  assert.equal(freeItem?.discount_type, "vnd");
  assert.equal(freeItem?.discount_value, 30000);
  assert.equal(freeItem?.discount_note, "Khuyến mãi tặng kèm Grab (0đ)");
});

test("GrabFood transformation: assigns partial item discount when Grab price is lower than menu base price", () => {
  const orderWithDiscountedItem: GrabOrderRaw = {
    orderID: "001644320651-PARTIALDISC",
    displayID: "GF-170",
    itemInfo: {
      items: [
        {
          name: "Sườn Cốt Lết",
          itemID: "VNITE20260818044418231553",
          quantity: 1,
          fare: { priceDisplay: "44.000", priceFloat: 44000 },
        },
      ],
    },
    fare: { subTotalDisplay: "44.000", totalDisplay: "44.000" },
  };

  const transformed = transformGrabOrderPayload(orderWithDiscountedItem, MOCK_DB_ITEMS);
  assert.equal(transformed.items.length, 1);
  const item = transformed.items[0];

  assert.equal(item?.item_name, "Sườn Cốt Lết");
  assert.equal(item?.unit_price, 54000);
  assert.equal(item?.discount_type, "vnd");
  assert.equal(item?.discount_value, 10000); // 54000 - 44000 = 10000
  assert.equal(item?.discount_note, "Khuyến mãi giảm giá món Grab");
});

test("GrabFood transformation: handles reference multi-item order with freeItem and orderLevelDiscounts deduplication (117k -> 107k)", () => {
  const dbItemsForRef = [
    ...MOCK_DB_ITEMS,
    { id: 10, name: "Bì", base_price: 12000 },
    { id: 11, name: "Trứng", base_price: 10000 },
    { id: 12, name: "Trà đá", base_price: 4000 },
  ];

  const referenceOrder: GrabOrderRaw = {
    orderID: "001644320651-REFERENCE-FIXTURE",
    displayID: "GF-730",
    merchant: { ID: "5-C8DTE75GUGJ3JT" },
    cutlery: 1, // Cutlery enum remains an unproven evidence gap; not synthesized into side items
    itemInfo: {
      items: [
        {
          name: "Sườn Cốt Lết",
          itemID: "VNITE20260818044418231553",
          quantity: 1,
          comment: "Ít cơm",
          fare: { priceDisplay: "73.000", priceFloat: 73000 },
          modifierGroups: [
            {
              modifierGroupID: "VNMOG2026081911022801159",
              modifierGroupName: "Dụng Cụ",
              modifiers: [
                {
                  modifierID: "VNMOD20260819110228013409",
                  modifierName: "Hộp, Muỗng, Nĩa",
                  priceDisplay: "3.000",
                  quantity: 1,
                },
              ],
            },
            {
              modifierGroupID: "VNMOG2026081911011906171",
              modifierGroupName: "Ăn Kèm",
              modifiers: [
                {
                  modifierID: "VNMOD20260819110119033709",
                  modifierName: "Bì",
                  priceDisplay: "12.000",
                  quantity: 1,
                },
              ],
            },
            {
              modifierGroupID: "VNMOG2026081911011906172",
              modifierGroupName: "Nước Uống",
              modifiers: [
                {
                  modifierName: "Trà đá",
                  priceDisplay: "4.000",
                  quantity: 1,
                },
              ],
            },
          ],
        },
        {
          name: "Canh Khổ Qua",
          itemID: "VNITE20260818044418190698",
          quantity: 1,
          fare: { priceDisplay: "30.000", priceFloat: 30000 },
        },
        {
          name: "Trà đá",
          itemID: "VNITE20260818044418179985",
          quantity: 1,
          fare: { priceDisplay: "4.000", priceFloat: 4000 },
        },
        {
          name: "Trứng",
          itemID: "VNITE20260818044418119394",
          quantity: 1,
          discountInfo: {
            discountType: "freeItem",
            itemDiscountPriceDisplay: "10.000",
          },
          fare: { priceDisplay: "0", priceFloat: 0 },
        },
      ],
    },
    fare: {
      subTotalDisplay: "117.000",
      totalDisplay: "107.000",
      orderLevelDiscounts: [
        {
          discountType: "freeItem",
          discountAmountDisplay: "10.000",
          description: "Tặng món Trứng",
        },
      ],
    },
  };

  const transformed = transformGrabOrderPayload(referenceOrder, dbItemsForRef);

  assert.equal(transformed.grossItemTotal, 117000);
  assert.equal(transformed.posTotalAmount, 107000);
  assert.equal(transformed.items.length, 4);

  // Main item: 54k + 3k + 12k + 4k = 73k
  assert.equal(transformed.items[0]?.item_name, "Sườn Cốt Lết");
  assert.equal(transformed.items[0]?.unit_price, 73000);
  assert.equal(transformed.items[0]?.discount_type, undefined);

  // Soup: 30k
  assert.equal(transformed.items[1]?.item_name, "Canh Khổ Qua");
  assert.equal(transformed.items[1]?.unit_price, 30000);

  // Drink: 4k
  assert.equal(transformed.items[2]?.item_name, "Trà đá");
  assert.equal(transformed.items[2]?.unit_price, 4000);

  // Free Egg: 10k discounted by 100% (freeItem)
  assert.equal(transformed.items[3]?.item_name, "Trứng");
  assert.equal(transformed.items[3]?.unit_price, 10000);
  assert.equal(transformed.items[3]?.discount_type, "vnd");
  assert.equal(transformed.items[3]?.discount_value, 10000);
});

test("GrabFood transformation: applies GF-553 array-shaped free-item promotion to the egg line", () => {
  const gf553Order = {
    orderID: "00113971352-REDACTED",
    displayID: "GF-553",
    merchant: { ID: "merchant-redacted" },
    itemInfo: {
      items: [
        {
          name: "Trà Tắc",
          itemID: "VNITE20260818044418148750",
          quantity: 1,
          fare: { priceDisplay: "25.000", priceFloat: 25000 },
          modifierGroups: [],
          discountInfo: null,
        },
        {
          name: "Sườn Cọng",
          itemID: "VNITE20260818044418223602",
          quantity: 1,
          fare: { priceDisplay: "87.000", priceFloat: 87000 },
          modifierGroups: [
            {
              modifierGroupName: "Ăn kèm",
              modifiers: [
                {
                  modifierID: "VNMOD20260819110649013214",
                  modifierName: "Cơm thêm",
                  priceDisplay: "6.000",
                  quantity: 1,
                },
              ],
            },
            {
              modifierGroupName: "Dụng Cụ Ăn Uống",
              modifiers: [
                {
                  modifierID: "VNMOD20260819110228013409",
                  modifierName: "Hộp, Muỗng, Nĩa",
                  priceDisplay: "3.000",
                  quantity: 1,
                },
              ],
            },
          ],
          discountInfo: null,
        },
        {
          name: "Trứng",
          itemID: "VNITE20260818044418119394",
          quantity: 1,
          fare: {
            priceDisplay: "10.000",
            originalItemPriceDisplay: "10.000",
            priceFloat: 10000,
          },
          modifierGroups: [],
          discountInfo: [
            {
              discountName: "Tặng món theo điều kiện",
              discountType: "freeItem",
              itemDiscountPriceDisplay: "10.000",
            },
          ],
        },
      ],
    },
    fare: {
      subTotalDisplay: "122.000",
      totalDisplay: "112.000",
      orderLevelDiscounts: [
        {
          discountType: "freeItem",
          discountAmountDisplay: "10.000",
          description: "Tặng món theo điều kiện",
        },
      ],
    },
  } as unknown as GrabOrderRaw;
  const transformed = transformGrabOrderPayload(gf553Order, [
    { id: 2, name: "Sườn Cọng", base_price: 78000 },
    { id: 11, name: "Trứng", base_price: 10000 },
    { id: 12, name: "Trà Tắc", base_price: 25000 },
    { id: 22, name: "Cơm Thêm", base_price: 6000 },
    { id: 29, name: "Dụng Cụ Mang Về", base_price: 3000 },
  ]);

  assert.equal(transformed.grossItemTotal, 122000);
  assert.equal(transformed.posTotalAmount, 112000);
  assert.equal(transformed.items.length, 3);
  assert.equal(transformed.items[2]?.item_name, "Trứng");
  assert.equal(transformed.items[2]?.unit_price, 10000);
  assert.equal(transformed.items[2]?.discount_type, "vnd");
  assert.equal(transformed.items[2]?.discount_value, 10000);
  assert.equal(transformed.items[2]?.discount_note, "Tặng món theo điều kiện");
});

test("GrabFood transformation: keeps GF-416 customer vouchers out of the POS total", () => {
  const gf416Order = {
    orderID: "0010944995-REDACTED",
    displayID: "GF-416",
    merchant: { ID: "merchant-redacted" },
    itemInfo: {
      items: [
        {
          name: "Sườn Cốt Lết",
          itemID: "VNITE20260818044418231553",
          quantity: 2,
          fare: { priceDisplay: "114.000", priceFloat: 57000 },
          modifierGroups: [
            {
              modifierGroupName: "Dụng Cụ Ăn Uống",
              modifiers: [
                {
                  modifierID: "VNMOD20260819110228013409",
                  modifierName: "Hộp, Muỗng, Nĩa",
                  priceDisplay: "3.000",
                  quantity: 1,
                },
              ],
            },
          ],
        },
        {
          name: "Tóp Mỡ",
          itemID: "VNITE20260818044418086205",
          quantity: 1,
          fare: { priceDisplay: "6.000", priceFloat: 6000 },
        },
        {
          name: "Chả",
          itemID: "VNITE20260818044418028323",
          quantity: 1,
          fare: { priceDisplay: "12.000", priceFloat: 12000 },
        },
        {
          name: "Trứng",
          itemID: "VNITE20260818044418119394",
          quantity: 1,
          fare: { priceDisplay: "10.000", priceFloat: 10000 },
          discountInfo: [
            {
              discountName: "Tặng ngay Trứng khi đặt đơn tối thiểu 70.000₫",
              discountType: "freeItem",
              itemDiscountPriceDisplay: "10.000",
            },
          ],
        },
      ],
    },
    fare: {
      subTotalDisplay: "142.000",
      totalDisplay: "94.500",
    },
    orderLevelDiscounts: [
      { discountType: "order", discountAmountDisplay: "22.500" },
      { discountType: "order", discountAmountDisplay: "15.000" },
      { discountType: "freeItem", discountAmountDisplay: "10.000" },
    ],
  } as GrabOrderRaw;

  const transformed = transformGrabOrderPayload(gf416Order, [
    { id: 1, name: "Sườn Cốt Lết", base_price: 54000 },
    { id: 8, name: "Tóp Mỡ", base_price: 6000 },
    { id: 9, name: "Chả", base_price: 12000 },
    { id: 11, name: "Trứng", base_price: 10000 },
    { id: 29, name: "Dụng Cụ Mang Về", base_price: 3000 },
  ]);

  assert.equal(transformed.grossItemTotal, 142000);
  assert.equal(transformed.itemDiscountTotal, 10000);
  assert.equal(transformed.posTotalAmount, 132000);
  assert.equal(transformed.customerPayableAmount, 94500);
  assert.equal(getGrabOrderLevelFreeItemDiscountTotal(gf416Order), 10000);
  assert.equal(transformed.items[3]?.discount_type, "vnd");
  assert.equal(transformed.items[3]?.discount_value, 10000);
  assert.equal(
    transformed.items[3]?.discount_note,
    "Tặng ngay Trứng khi đặt đơn tối thiểu 70.000₫",
  );
});

test("GrabFood transformation: discounts only the promoted quantity on a multi-quantity line", () => {
  const transformed = transformGrabOrderPayload(
    {
      orderID: "001644320651-MULTI-QUANTITY",
      displayID: "GF-MULTI",
      merchant: { ID: "merchant-redacted" },
      itemInfo: {
        items: [
          {
            name: "Trứng",
            itemID: "VNITE20260818044418119394",
            quantity: 2,
            fare: {
              priceDisplay: "20.000",
              originalItemPriceDisplay: "20.000",
              priceFloat: 20000,
            },
            discountInfo: [
              {
                discountName: "Tặng một Trứng",
                discountType: "freeItem",
                itemDiscountPriceDisplay: "10.000",
              },
            ],
          },
        ],
      },
      fare: {
        subTotalDisplay: "20.000",
        totalDisplay: "10.000",
        orderLevelDiscounts: [
          {
            discountType: "freeItem",
            discountAmountDisplay: "10.000",
          },
        ],
      },
    },
    [{ id: 11, name: "Trứng", base_price: 10000 }],
  );

  assert.equal(transformed.grossItemTotal, 20000);
  assert.equal(transformed.itemDiscountTotal, 10000);
  assert.equal(transformed.freeItemDiscountTotal, 10000);
  assert.equal(transformed.posTotalAmount, 10000);
  assert.equal(transformed.items[0]?.quantity, 2);
  assert.equal(transformed.items[0]?.discount_type, "vnd");
  assert.equal(transformed.items[0]?.discount_value, 10000);
});

test("GrabFood transformation: uses the Grab channel price for GF-809 free-item evidence", () => {
  const grabPricedEgg = {
    id: 11,
    name: "Trứng",
    base_price: 8000,
    channel_price: 10000,
  };
  const transformed = transformGrabOrderPayload(
    {
      orderID: "001644320651-GF809",
      displayID: "GF-809",
      merchant: { ID: "merchant-redacted" },
      itemInfo: {
        items: [
          {
            name: "Trứng",
            itemID: "VNITE20260818044418119394",
            quantity: 1,
            fare: {
              priceDisplay: "10.000",
              originalItemPriceDisplay: "10.000",
              priceFloat: 10000,
            },
            discountInfo: [
              {
                discountName: "Tặng Trứng",
                discountType: "freeItem",
                itemDiscountPriceDisplay: "10.000",
              },
            ],
          },
        ],
      },
      fare: {
        subTotalDisplay: "10.000",
        totalDisplay: "0",
        orderLevelDiscounts: [
          {
            discountType: "freeItem",
            discountAmountDisplay: "10.000",
          },
        ],
      },
    },
    [grabPricedEgg],
  );

  assert.equal(transformed.grossItemTotal, 10000);
  assert.equal(transformed.freeItemDiscountTotal, 10000);
  assert.equal(transformed.posTotalAmount, 0);
  assert.equal(transformed.items[0]?.unit_price, 10000);
  assert.equal(transformed.items[0]?.discount_value, 10000);
});

test("GrabFood security: malicious customer comments with 'tặng', 'free', '0đ' NEVER authorize discounts", () => {
  const maliciousOrder: GrabOrderRaw = {
    orderID: "001644320651-MALICIOUS",
    displayID: "GF-HACK",
    merchant: { ID: "5-C8DTE75GUGJ3JT" },
    eater: {
      name: "Attacker",
      mobileNumber: "0999999999",
      comment: "Quán tặng mình free 0đ sườn cọng nha, 0đ 0 đ free tặng quà tặng",
    },
    itemInfo: {
      items: [
        {
          name: "Sườn Cốt Lết",
          itemID: "VNITE20260818044418231553",
          quantity: 1,
          comment: "Quán ơi tặng thêm miếng sườn free 0đ nha",
          fare: { priceDisplay: "54.000", priceFloat: 54000 },
        },
      ],
    },
    fare: { subTotalDisplay: "54.000", totalDisplay: "54.000" },
  };

  const transformed = transformGrabOrderPayload(maliciousOrder, MOCK_DB_ITEMS);
  const item = transformed.items[0];

  assert.equal(item?.discount_type, undefined);
  assert.equal(item?.discount_value, undefined);
  assert.equal(transformed.posTotalAmount, 54000);
  assert.equal(item?.note, "Quán ơi tặng thêm miếng sườn free 0đ nha");
});

test("GrabFood mapping: parseMonetaryAmount distinguishes legitimate 0 from invalid / missing amounts", () => {
  assert.equal(parseMonetaryAmount(0), 0);
  assert.equal(parseMonetaryAmount("0"), 0);
  assert.equal(parseMonetaryAmount("0đ"), 0);
  assert.equal(parseMonetaryAmount("0.000"), 0);
  assert.equal(parseMonetaryAmount(107000), 107000);
  assert.equal(parseMonetaryAmount("107.000"), 107000);
  assert.equal(parseMonetaryAmount("107.000đ"), 107000);
  assert.equal(parseMonetaryAmount(""), null);
  assert.equal(parseMonetaryAmount(null), null);
  assert.equal(parseMonetaryAmount(undefined), null);
  assert.equal(parseMonetaryAmount(-100), null);
  assert.equal(parseMonetaryAmount(NaN), null);
});

test("GrabFood mapping: preserves legitimate 0đ total for 100% discounted orders", () => {
  const zeroTotalOrder: GrabOrderRaw = {
    orderID: "001644320651-ZERO-TOTAL",
    displayID: "GF-ZERO",
    merchant: { ID: "5-C8DTE75GUGJ3JT" },
    itemInfo: {
      items: [
        {
          name: "Sườn Cốt Lết",
          itemID: "VNITE20260818044418231553",
          quantity: 1,
          discountInfo: { discountType: "freeItem" },
          fare: { priceDisplay: "0", priceFloat: 0 },
        },
      ],
    },
    fare: { subTotalDisplay: "54.000", totalDisplay: "0" },
  };

  const transformed = transformGrabOrderPayload(zeroTotalOrder, MOCK_DB_ITEMS);
  assert.equal(transformed.grossItemTotal, 54000);
  assert.equal(transformed.posTotalAmount, 0); // Legitimate 0 must NOT revert to 54000
});

test("GrabFood security: validateGrabMerchantForBranch enforces cross-branch merchant isolation", () => {
  const previousMappings = process.env.GRAB_BRANCH_MERCHANT_MAPPINGS;
  process.env.GRAB_BRANCH_MERCHANT_MAPPINGS = JSON.stringify({
    37: "merchant-alpha",
    91: "merchant-beta",
  });

  try {
    assert.equal(validateGrabMerchantForBranch(37, "merchant-alpha"), true);
    assert.equal(validateGrabMerchantForBranch(91, "merchant-beta"), true);
    assert.equal(validateGrabMerchantForBranch(37, "merchant-beta"), false);
    assert.equal(validateGrabMerchantForBranch(52, "merchant-alpha"), false);
    assert.equal(validateGrabMerchantForBranch(37, null), false);
    assert.equal(validateGrabMerchantForBranch(37, ""), false);
  } finally {
    if (previousMappings === undefined) {
      delete process.env.GRAB_BRANCH_MERCHANT_MAPPINGS;
    } else {
      process.env.GRAB_BRANCH_MERCHANT_MAPPINGS = previousMappings;
    }
  }
});

test("GrabFood merchant validation fails closed without explicit branch mapping", () => {
  const previousMappings = process.env.GRAB_BRANCH_MERCHANT_MAPPINGS;
  delete process.env.GRAB_BRANCH_MERCHANT_MAPPINGS;
  try {
    assert.equal(validateGrabMerchantForBranch(37, "merchant-alpha"), false);
  } finally {
    if (previousMappings !== undefined) {
      process.env.GRAB_BRANCH_MERCHANT_MAPPINGS = previousMappings;
    }
  }
});
