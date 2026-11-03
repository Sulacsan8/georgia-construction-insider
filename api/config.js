import { handle, json } from "./_lib.js";

// Public settings the browser needs to talk to Supabase. Both values are safe to share.
export const GET = handle(async () =>
  json(200, {
    supabaseUrl: process.env.SUPABASE_URL || null,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null,
  }),
);
