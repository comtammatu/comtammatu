DROP POLICY IF EXISTS "branch_ops_receive" ON realtime.messages;

CREATE POLICY "branch_ops_receive"
ON realtime.messages
FOR SELECT TO authenticated
USING (
  CASE
    WHEN realtime.topic() ~ '^branch:[1-9][0-9]{0,18}:ops$' THEN
      CASE
        WHEN split_part(realtime.topic(), ':', 2)::numeric
             <= 9223372036854775807::numeric
          THEN public.can_read_branch_ops(
            split_part(realtime.topic(), ':', 2)::bigint
          )
        ELSE FALSE
      END
    ELSE FALSE
  END
);
