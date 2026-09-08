-- Shared by the TypeScript contract test and the SQL integration test.
CREATE TEMP TABLE effective_stock_threshold_cases (case_data jsonb NOT NULL) ON COMMIT DROP;
INSERT INTO effective_stock_threshold_cases (case_data)
SELECT value FROM pg_catalog.jsonb_array_elements(
$threshold_cases$
[
  {
    "name": "unset fields resolve to zero and unbounded capacity",
    "ingredient": {},
    "location": {},
    "expected": {
      "minStockLevel": 0,
      "targetStockLevel": 0,
      "capacityLimit": null
    }
  },
  {
    "name": "explicit nulls inherit independently",
    "ingredient": {
      "minStockLevel": 5,
      "targetStockLevel": 12,
      "capacityLimit": 20
    },
    "location": {
      "minStockLevel": null,
      "targetStockLevel": null,
      "capacityLimit": null
    },
    "expected": {
      "minStockLevel": 5,
      "targetStockLevel": 12,
      "capacityLimit": 20
    }
  },
  {
    "name": "location minimum determines fallback target",
    "ingredient": {
      "minStockLevel": 5
    },
    "location": {
      "minStockLevel": 8
    },
    "expected": {
      "minStockLevel": 8,
      "targetStockLevel": 16,
      "capacityLimit": null
    }
  },
  {
    "name": "ingredient target precedes fallback from location minimum",
    "ingredient": {
      "minStockLevel": 5,
      "targetStockLevel": 12
    },
    "location": {
      "minStockLevel": 8
    },
    "expected": {
      "minStockLevel": 8,
      "targetStockLevel": 12,
      "capacityLimit": null
    }
  },
  {
    "name": "location target overrides while other fields inherit",
    "ingredient": {
      "minStockLevel": 5,
      "targetStockLevel": 12,
      "capacityLimit": 20
    },
    "location": {
      "targetStockLevel": 15
    },
    "expected": {
      "minStockLevel": 5,
      "targetStockLevel": 15,
      "capacityLimit": 20
    }
  },
  {
    "name": "location capacity overrides ingredient capacity",
    "ingredient": {
      "minStockLevel": 5,
      "targetStockLevel": 12,
      "capacityLimit": 20
    },
    "location": {
      "capacityLimit": 15
    },
    "expected": {
      "minStockLevel": 5,
      "targetStockLevel": 12,
      "capacityLimit": 15
    }
  },
  {
    "name": "explicit zeros override positive defaults",
    "ingredient": {
      "minStockLevel": 5,
      "targetStockLevel": 12,
      "capacityLimit": 20
    },
    "location": {
      "minStockLevel": 0,
      "targetStockLevel": 0,
      "capacityLimit": 0
    },
    "expected": {
      "minStockLevel": 0,
      "targetStockLevel": 0,
      "capacityLimit": 0
    }
  },
  {
    "name": "zero minimum preserves inherited target",
    "ingredient": {
      "minStockLevel": 5,
      "targetStockLevel": 12
    },
    "location": {
      "minStockLevel": 0
    },
    "expected": {
      "minStockLevel": 0,
      "targetStockLevel": 12,
      "capacityLimit": null
    }
  },
  {
    "name": "null location capacity cannot clear configured capacity",
    "ingredient": {
      "minStockLevel": 5,
      "capacityLimit": 10
    },
    "location": {
      "capacityLimit": null
    },
    "expected": {
      "minStockLevel": 5,
      "targetStockLevel": 10,
      "capacityLimit": 10
    }
  },
  {
    "name": "equal minimum target and capacity are valid",
    "ingredient": {
      "minStockLevel": 7,
      "targetStockLevel": 7,
      "capacityLimit": 7
    },
    "location": {},
    "expected": {
      "minStockLevel": 7,
      "targetStockLevel": 7,
      "capacityLimit": 7
    }
  },
  {
    "name": "three decimal places are preserved",
    "ingredient": {
      "minStockLevel": 0.001
    },
    "location": {
      "capacityLimit": 0.003
    },
    "expected": {
      "minStockLevel": 0.001,
      "targetStockLevel": 0.002,
      "capacityLimit": 0.003
    }
  },
  {
    "name": "fractional fallback remains exact",
    "ingredient": {
      "minStockLevel": 0.145
    },
    "location": {},
    "expected": {
      "minStockLevel": 0.145,
      "targetStockLevel": 0.29,
      "capacityLimit": null
    }
  },
  {
    "name": "maximum explicit threshold remains representable",
    "ingredient": {
      "minStockLevel": 999999999999.999,
      "targetStockLevel": 999999999999.999,
      "capacityLimit": 999999999999.999
    },
    "location": {},
    "expected": {
      "minStockLevel": 999999999999.999,
      "targetStockLevel": 999999999999.999,
      "capacityLimit": 999999999999.999
    }
  },
  {
    "name": "largest minimum with representable fallback is valid",
    "ingredient": {
      "minStockLevel": 499999999999.999
    },
    "location": {},
    "expected": {
      "minStockLevel": 499999999999.999,
      "targetStockLevel": 999999999999.998,
      "capacityLimit": null
    }
  },
  {
    "name": "negative minimum is invalid",
    "ingredient": {
      "minStockLevel": -0.001
    },
    "location": {},
    "error": "stock_threshold_quantity_invalid"
  },
  {
    "name": "negative target is invalid",
    "ingredient": {
      "targetStockLevel": -1
    },
    "location": {},
    "error": "stock_threshold_quantity_invalid"
  },
  {
    "name": "negative capacity is invalid",
    "ingredient": {
      "capacityLimit": -1
    },
    "location": {},
    "error": "stock_threshold_quantity_invalid"
  },
  {
    "name": "fractional precision is not rounded",
    "ingredient": {
      "minStockLevel": 0.0001
    },
    "location": {},
    "error": "stock_threshold_quantity_invalid"
  },
  {
    "name": "values outside numeric range are invalid",
    "ingredient": {
      "targetStockLevel": 1000000000000
    },
    "location": {},
    "error": "stock_threshold_quantity_invalid"
  },
  {
    "name": "derived target overflow is invalid",
    "ingredient": {
      "minStockLevel": 500000000000
    },
    "location": {},
    "error": "stock_threshold_quantity_invalid"
  },
  {
    "name": "target below minimum is invalid",
    "ingredient": {
      "minStockLevel": 8,
      "targetStockLevel": 7
    },
    "location": {},
    "error": "stock_threshold_order_invalid"
  },
  {
    "name": "capacity below target is invalid",
    "ingredient": {
      "minStockLevel": 8,
      "capacityLimit": 15
    },
    "location": {},
    "error": "stock_threshold_order_invalid"
  },
  {
    "name": "partial override cannot exceed inherited target",
    "ingredient": {
      "minStockLevel": 5,
      "targetStockLevel": 12
    },
    "location": {
      "minStockLevel": 13
    },
    "error": "stock_threshold_order_invalid"
  },
  {
    "name": "inherited capacity bounds overridden target",
    "ingredient": {
      "minStockLevel": 5,
      "capacityLimit": 12
    },
    "location": {
      "targetStockLevel": 13
    },
    "error": "stock_threshold_order_invalid"
  },
  {
    "name": "zero target does not inherit positive target",
    "ingredient": {
      "minStockLevel": 5,
      "targetStockLevel": 12
    },
    "location": {
      "targetStockLevel": 0
    },
    "error": "stock_threshold_order_invalid"
  },
  {
    "name": "zero capacity does not inherit positive capacity",
    "ingredient": {
      "minStockLevel": 5,
      "capacityLimit": 20
    },
    "location": {
      "capacityLimit": 0
    },
    "error": "stock_threshold_order_invalid"
  },
  {
    "name": "shadowed invalid minimum is rejected",
    "ingredient": {
      "minStockLevel": -1
    },
    "location": {
      "minStockLevel": 0
    },
    "error": "stock_threshold_quantity_invalid"
  },
  {
    "name": "shadowed invalid target is rejected",
    "ingredient": {
      "targetStockLevel": 0.0001
    },
    "location": {
      "targetStockLevel": 0
    },
    "error": "stock_threshold_quantity_invalid"
  },
  {
    "name": "shadowed invalid capacity is rejected",
    "ingredient": {
      "capacityLimit": 1000000000000
    },
    "location": {
      "capacityLimit": 0
    },
    "error": "stock_threshold_quantity_invalid"
  },
  {
    "name": "large four-decimal target is rejected without floating point tolerance",
    "ingredient": {
      "targetStockLevel": 999999999999.0021
    },
    "location": {},
    "error": "stock_threshold_quantity_invalid"
  }
]
$threshold_cases$::jsonb
);
