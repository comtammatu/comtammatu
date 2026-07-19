ALTER POLICY "attendance_select"
ON "public"."attendance_records"
USING (
  (
    "tenant_id" = "public"."auth_tenant_id"()
    AND (
      EXISTS (
        SELECT 1
        FROM "public"."employees" AS "e"
        WHERE "e"."id" = "attendance_records"."employee_id"
          AND "e"."profile_id" = (SELECT "auth"."uid"())
      )
      OR "public"."has_permission"("branch_id", 'staff:view'::text)
      OR "public"."has_permission"("branch_id", 'hr:view_employee'::text)
      OR "public"."has_permission"("branch_id", 'staff:manage'::text)
      OR "public"."has_permission"("branch_id", 'hr:approve_checkout'::text)
    )
  )
);
