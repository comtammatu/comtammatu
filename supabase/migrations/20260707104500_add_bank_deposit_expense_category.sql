ALTER TABLE expenses DROP CONSTRAINT expenses_category_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_category_check CHECK ((category = ANY (ARRAY['rent'::text, 'utilities'::text, 'gas_fuel'::text, 'salary'::text, 'cogs_manual'::text, 'supplies'::text, 'repair'::text, 'marketing'::text, 'fees_tax'::text, 'bank_deposit'::text, 'other'::text])));
