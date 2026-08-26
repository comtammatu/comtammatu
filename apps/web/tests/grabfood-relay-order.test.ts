import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GRAB_MENU_MAPPING,
  normalizeMenuName,
  generateOrderUuid,
  transformGrabOrderPayload,
  matchMenuItem,
  type GrabOrderRaw,
} from "../lib/grabfood/mapping";

const MOCK_GRAB_ORDER_REAL: GrabOrderRaw = {
  orderID: "001644320651-C8DYVFLKG2VUN2",
  displayID: "GF-725",
  merchant: {
    ID: "5-C8DTE75GUGJ3JT",
  },
  eater: {
    name: "The Binh Luong",
    mobileNumber: "+84 3994 2835 7",
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
  assert.equal(transformed.subtotal, 63000);
  assert.equal(transformed.totalAmount, 63000);

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
    { id: 22, name: "Cơm Tấm Thêm", base_price: 6000 },
  ];

  const orderWithComThem: GrabOrderRaw = {
    ...MOCK_GRAB_ORDER_REAL,
    displayID: "GF-168",
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
  assert.equal(lineItem?.sides[0]?.name, "Cơm Tấm Thêm");
  assert.equal(lineItem?.sides[1]?.side_item_id, 22);
  assert.equal(lineItem?.sides[1]?.name, "Cơm Tấm Thêm");
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
  assert.equal(freeItem?.discount_type, "pct");
  assert.equal(freeItem?.discount_value, 100);
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
