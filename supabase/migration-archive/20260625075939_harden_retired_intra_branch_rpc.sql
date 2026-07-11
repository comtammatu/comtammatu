REVOKE EXECUTE ON FUNCTION public.commit_intra_branch_transfer(BIGINT, BIGINT, BIGINT, TEXT, TEXT, JSONB)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.commit_intra_branch_transfer(BIGINT, BIGINT, BIGINT, TEXT, TEXT, JSONB)
TO service_role;
