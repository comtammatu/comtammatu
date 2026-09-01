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
  { id: 5, name: "Canh Chua Tôm", base_price: 30000 },
  { id: 7, name: "Trứng", base_price: 10000 },
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

test("ShopeeFood mapping: matches receipt meal aliases without falling back to the first menu item", () => {
  const matched = matchMenuItem(
    {
      name: "Cơm Sườn Cốt Lết",
      quantity: 1,
    },
    [
      { id: 99, name: "Món Không Liên Quan", base_price: 10000 },
      ...MOCK_DB_ITEMS,
    ],
  );

  assert.equal(matched.id, 1);
  assert.equal(matched.name, "Sườn Cốt Lết");
});

test("ShopeeFood mapping: resolves Rau Má Đường and Rau Má Sữa as variants of one item", () => {
  const catalog = [
    { id: 99, name: "Món Không Liên Quan", base_price: 10000 },
    {
      id: 910,
      name: "Rau Má",
      base_price: 20000,
      variants: [
        { id: 1701, name: "Rau Má Sữa", price_adjustment: 0 },
        { id: 1801, name: "Rau Má Đường", price_adjustment: 0 },
      ],
    },
  ];
  const sugarPennywort = matchMenuItem(
    {
      name: "Rau Má Đường",
      quantity: 1,
    },
    catalog,
  );
  const milkPennywort = matchMenuItem(
    {
      itemId: "SPF_ITEM_RAU_MA",
      name: "Rau Má Sữa",
      quantity: 1,
    },
    catalog,
  );

  assert.equal(sugarPennywort.id, 910);
  assert.equal(sugarPennywort.name, "Rau Má");
  assert.equal(sugarPennywort.base_price, 20000);
  assert.equal(sugarPennywort.variant?.id, 1801);
  assert.equal(sugarPennywort.variant?.name, "Rau Má Đường");
  assert.equal(milkPennywort.id, 910);
  assert.equal(milkPennywort.name, "Rau Má");
  assert.equal(milkPennywort.base_price, 20000);
  assert.equal(milkPennywort.variant?.id, 1701);
  assert.equal(milkPennywort.variant?.name, "Rau Má Sữa");

  const transformed = transformShopeeOrderPayload(
    {
      orderId: "test-rau-ma-variants",
      items: [
        { name: "Rau Má Đường", quantity: 1 },
        {
          itemId: "SPF_ITEM_RAU_MA",
          name: "Rau Má Sữa",
          quantity: 1,
        },
      ],
    },
    catalog,
  );

  assert.deepEqual(
    transformed.items.map((item) => ({
      menu_item_id: item.menu_item_id,
      variant_id: item.variant_id,
      variant_name: item.variant_name,
    })),
    [
      { menu_item_id: 910, variant_id: 1801, variant_name: "Rau Má Đường" },
      { menu_item_id: 910, variant_id: 1701, variant_name: "Rau Má Sữa" },
    ],
  );

  assert.throws(
    () =>
      matchMenuItem(
        {
          itemId: "SPF_ITEM_RAU_MA",
          name: "Rau Má Sữa",
          quantity: 1,
        },
        catalog.map((item) => ({ ...item, variants: [] })),
      ),
    /chưa được ánh xạ trong thực đơn quán/i,
  );
});

test("ShopeeFood mapping: rejects unknown items instead of silently choosing another menu item", () => {
  assert.throws(
    () =>
      matchMenuItem(
        { name: "Món Chưa Ánh Xạ", quantity: 1 },
        MOCK_DB_ITEMS,
      ),
    /chưa được ánh xạ trong thực đơn quán/i,
  );
});

test("ShopeeFood transformation: transforms real SPF-892 order accurately", () => {
  const transformed = transformShopeeOrderPayload(MOCK_SHOPEE_ORDER_REAL, MOCK_DB_ITEMS);

  assert.equal(transformed.orderId, "260825-9812401");
  assert.equal(transformed.displayId, "SPF-892");
  assert.equal(transformed.restaurantId, "1002345");
  assert.equal(transformed.paymentMethod, "platform");
  assert.equal(transformed.subtotal, 156000);
  assert.equal(transformed.totalAmount, 156000);

  // Customer note: Delivery platforms have no order-level notes; stays null to avoid yellow KDS banner
  assert.equal(transformed.customerNote, null);

  // Items
  assert.equal(transformed.items.length, 2);

  const lineItem1 = transformed.items[0];
  assert.equal(lineItem1?.menu_item_id, 1);
  assert.equal(lineItem1?.item_name, "Sườn Cốt Lết");
  assert.equal(lineItem1?.quantity, 2);
  assert.equal(lineItem1?.unit_price, 72000);
  assert.equal(lineItem1?.subtotal, 144000);
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
  assert.equal(transformed.customerNote, null);
});

test("ShopeeFood transformation: keeps the platform total separate from item discounts", () => {
  const transformed = transformShopeeOrderPayload(
    {
      orderId: "12345-987654321",
      displayId: "12345-987654321",
      items: [
        {
          name: "Cơm Sườn Cốt Lết",
          quantity: 1,
          price: 99000,
          options: [{ name: "Dụng cụ ăn uống", price: 3000 }],
        },
      ],
      subtotal: 57000,
      total: 43007,
    },
    MOCK_DB_ITEMS,
  );

  assert.equal(transformed.totalAmount, 43007);
  assert.equal(
    transformed.items[0]?.unit_price,
    57000,
    "the relay payload must use the mapped menu price plus mapped sides, never trust OCR price text",
  );
  assert.equal(transformed.items[0]?.discount_type, undefined);
  assert.equal(transformed.items[0]?.discount_value, undefined);
});

test("ShopeeFood transformation: promotes explicit soup options to standalone POS items", () => {
  const transformed = transformShopeeOrderPayload(
    {
      orderId: "12345-111111111",
      items: [
        {
          name: "Cơm Sườn Cốt Lết",
          quantity: 1,
          price: 97000,
          options: [
            { name: "Trứng", price: 10000 },
            { name: "Canh Chua Tôm", price: 30000 },
            { name: "Dụng cụ ăn uống", price: 3000 },
          ],
        },
      ],
      subtotal: 97000,
      total: 73000,
    },
    MOCK_DB_ITEMS,
  );

  assert.equal(transformed.items.length, 2);
  assert.equal(transformed.items[0]?.item_name, "Sườn Cốt Lết");
  assert.equal(transformed.items[0]?.unit_price, 67000);
  assert.deepEqual(
    transformed.items[0]?.sides.map((side) => side.name),
    ["Trứng", "Dụng Cụ Mang Về"],
  );
  assert.match(transformed.items[0]?.note ?? "", /Tùy chọn: Canh Chua Tôm/);
  assert.deepEqual(transformed.items[1], {
    menu_item_id: 5,
    item_name: "Canh Chua Tôm",
    quantity: 1,
    unit_price: 30000,
    modifiers: [],
    sides: [],
    subtotal: 30000,
    note: null,
  });
});

test("ShopeeFood transformation: keeps daily soup as a kitchen option note", () => {
  const transformed = transformShopeeOrderPayload(
    {
      orderId: "12345-222222222",
      items: [
        {
          name: "Cơm Sườn Cốt Lết",
          quantity: 1,
          price: 57000,
          options: [
            { name: "Canh theo ngày" },
            { name: "Dụng cụ ăn uống", price: 3000 },
          ],
        },
      ],
    },
    MOCK_DB_ITEMS,
  );

  assert.equal(transformed.items.length, 1);
  assert.equal(transformed.items[0]?.note, "Tùy chọn: Canh theo ngày");
  assert.deepEqual(
    transformed.items[0]?.sides.map((side) => side.name),
    ["Dụng Cụ Mang Về"],
  );
});

test("ShopeeFood transformation: missing OCR price never creates a free-item discount", () => {
  const transformed = transformShopeeOrderPayload(
    {
      orderId: "12345-444444444",
      items: [{ name: "Cơm Sườn Cốt Lết", quantity: 1 }],
    },
    MOCK_DB_ITEMS,
  );

  assert.equal(transformed.items[0]?.unit_price, 54000);
  assert.equal(transformed.items[0]?.discount_type, undefined);
  assert.equal(transformed.items[0]?.discount_value, undefined);
});

test("ShopeeFood mapping: resolves extra rice to the real POS menu name", () => {
  const transformed = transformShopeeOrderPayload(
    {
      orderId: "12345-333333333",
      items: [{ name: "Cơm thêm", quantity: 1, price: 6000 }],
    },
    [
      ...MOCK_DB_ITEMS,
      { id: 9, name: "Cơm Thêm", base_price: 6000 },
    ],
  );

  assert.equal(transformed.items[0]?.menu_item_id, 9);
  assert.equal(transformed.items[0]?.item_name, "Cơm Thêm");
});

test("ShopeeFood transformation: maps the extra-rice option to a priced POS side", () => {
  const transformed = transformShopeeOrderPayload(
    {
      orderId: "25086-553553553",
      items: [
        {
          itemId: "SPF_ITEM_SUON_COT_LET",
          name: "Sườn Cốt Lết",
          quantity: 1,
          price: 60000,
          options: [
            {
              groupName: "Tùy chọn",
              optionId: "SPF_MOD_COM_THEM",
              name: "Cơm thêm",
              price: 6000,
            },
          ],
        },
      ],
    },
    [
      ...MOCK_DB_ITEMS,
      { id: 9, name: "Cơm Thêm", base_price: 6000 },
    ],
  );

  assert.equal(transformed.items[0]?.note, null);
  assert.deepEqual(transformed.items[0]?.sides, [
    { side_item_id: 9, name: "Cơm Thêm", price: 6000, quantity: 1 },
  ]);
  assert.equal(transformed.items[0]?.unit_price, 60000);
});
