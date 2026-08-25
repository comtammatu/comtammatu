import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SHOPEE_MENU_MAPPING,
  normalizeMenuName,
  transformShopeeOrderPayload,
  matchMenuItem,
  type ShopeeOrderRaw,
} from "../lib/shopeefood/mapping";

const MOCK_SHOPEE_ORDER_REAL: ShopeeOrderRaw = {
  orderId: "260825-9812401",
  orderCode: "SPF-892",
  displayId: "SPF-892",
  restaurantId: "1002345",
  customer: {
    name: "Nguyễn Văn Hùng",
    phone: "0901234567",
    note: "Cho nhiều nước mắm",
  },
  needCutlery: 1,
  dishList: [
    {
      itemId: "SPF_ITEM_SUON_COT_LET",
      name: "Sườn Cốt Lết",
      quantity: 2,
      price: "63.000",
      note: "Miếng sườn nướng cháy cạnh",
      options: [
        {
          groupName: "Dụng cụ ăn uống",
          name: "Hộp, Muỗng, Nĩa",
          price: 3000,
          quantity: 2,
        },
        {
          groupName: "Ăn kèm",
          name: "Tóp mỡ",
          price: 6000,
          quantity: 2,
        },
      ],
    },
    {
      itemId: "SPF_ITEM_CANH_KHO_QUA",
      name: "Canh Khổ Qua",
      quantity: 1,
      price: "30000",
    },
  ],
  subtotal: "156000",
  total: "156000",
  paymentMethod: "ShopeePay",
};

const MOCK_DB_ITEMS = [
  { id: 1, name: "Sườn Cốt Lết", base_price: 54000 },
  { id: 2, name: "Sườn Cọng", base_price: 78000 },
  { id: 3, name: "Sườn Một Gang", base_price: 120000 },
  { id: 4, name: "Canh Khổ Qua", base_price: 30000 },
  { id: 8, name: "Tóp Mỡ", base_price: 6000 },
  { id: 29, name: "Dụng Cụ Mang Về", base_price: 3000 },
];

test("ShopeeFood mapping: normalizeMenuName normalizes accents and case", () => {
  assert.equal(normalizeMenuName("Sườn Cốt Lết"), "suon cot let");
  assert.equal(normalizeMenuName("Trà đá"), "tra da");
  assert.equal(normalizeMenuName("Cơm Tấm Chả"), "com tam cha");
  assert.equal(SHOPEE_MENU_MAPPING["SPF_ITEM_SUON_COT_LET"]?.name, "Sườn Cốt Lết");
});

test("ShopeeFood mapping: matchMenuItem finds exact ID in DB items", () => {
  const shopeeItem = {
    itemId: "SPF_ITEM_SUON_COT_LET",
    name: "Sườn Cốt Lết",
    quantity: 1,
  };

  const matched = matchMenuItem(shopeeItem, MOCK_DB_ITEMS);
  assert.equal(matched.id, 1);
  assert.equal(matched.name, "Sườn Cốt Lết");
  assert.equal(matched.base_price, 54000);
});

test("ShopeeFood transformation: transforms real SPF-892 order accurately", () => {
  const transformed = transformShopeeOrderPayload(MOCK_SHOPEE_ORDER_REAL, MOCK_DB_ITEMS);

  assert.equal(transformed.orderId, "260825-9812401");
  assert.equal(transformed.displayId, "SPF-892");
  assert.equal(transformed.restaurantId, "1002345");
  assert.equal(transformed.paymentMethod, "platform");
  assert.equal(transformed.subtotal, 156000);
  assert.equal(transformed.totalAmount, 156000);

  // Customer note
  assert.ok(transformed.customerNote.includes("[ShopeeFood SPF-892]"));
  assert.ok(transformed.customerNote.includes("Nguyễn Văn Hùng"));
  assert.ok(transformed.customerNote.includes("0901234567"));
  assert.ok(transformed.customerNote.includes("Lấy muỗng đũa"));
  assert.ok(transformed.customerNote.includes("Cho nhiều nước mắm"));

  // Items
  assert.equal(transformed.items.length, 2);

  const lineItem1 = transformed.items[0];
  assert.equal(lineItem1?.menu_item_id, 1);
  assert.equal(lineItem1?.item_name, "Sườn Cốt Lết");
  assert.equal(lineItem1?.quantity, 2);
  assert.equal(lineItem1?.unit_price, 63000);
  assert.equal(lineItem1?.subtotal, 126000);
  assert.equal(lineItem1?.note, "Miếng sườn nướng cháy cạnh");
  assert.equal(lineItem1?.modifiers.length, 0);
  assert.equal(lineItem1?.sides.length, 2);
  assert.deepEqual(lineItem1?.sides, [
    { side_item_id: 29, name: "Dụng Cụ Mang Về", price: 3000, quantity: 2 },
    { side_item_id: 8, name: "Tóp Mỡ", price: 6000, quantity: 2 },
  ]);

  const lineItem2 = transformed.items[1];
  assert.equal(lineItem2?.menu_item_id, 4);
  assert.equal(lineItem2?.item_name, "Canh Khổ Qua");
  assert.equal(lineItem2?.quantity, 1);
  assert.equal(lineItem2?.unit_price, 30000);
  assert.equal(lineItem2?.subtotal, 30000);
});

test("ShopeeFood transformation: handles deliverynow restaurant metadata", () => {
  const mockOrderWithStore: ShopeeOrderRaw = {
    orderId: "260825-999999",
    orderCode: "SPF-101",
    displayId: "SPF-101",
    restaurantId: 1000106154,
    restaurantName: "Cơm Tấm Má Tư - Nguyễn Hữu Thọ",
    customer: {
      name: "Trần Thị Mai",
      phone: "0918889999",
    },
    items: [
      {
        itemId: "SPF_ITEM_SUON_CONG",
        name: "Sườn Cọng",
        quantity: 1,
        price: 78000,
      },
    ],
    totalPrice: 78000,
  };

  const transformed = transformShopeeOrderPayload(mockOrderWithStore, MOCK_DB_ITEMS);
  assert.equal(transformed.displayId, "SPF-101");
  assert.equal(transformed.restaurantId, "1000106154");
  assert.equal(transformed.totalAmount, 78000);
  assert.equal(transformed.items.length, 1);
  assert.equal(transformed.items[0]?.item_name, "Sườn Cọng");
  assert.ok(transformed.customerNote.includes("[ShopeeFood SPF-101]"));
  assert.ok(transformed.customerNote.includes("Trần Thị Mai"));
});
