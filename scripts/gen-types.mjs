#!/usr/bin/env node
const requestedProjectId = process.env["SUPABASE_PROJECT_ID"]?.trim();
const requestedTarget = requestedProjectId
  ? `SUPABASE_PROJECT_ID=${requestedProjectId}`
  : "the default target";
console.error(
  `gen-types: no persistent Cloud DEV is registered; refusing to generate types for ${requestedTarget}. Register an explicit DEV ref in docs/agent/rules/database.md first.`,
);
process.exit(1);
