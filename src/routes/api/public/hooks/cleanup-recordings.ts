import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, apikey, Authorization",
} as const;

const RETENTION_DAYS = 30;

export const Route = createFileRoute("/api/public/hooks/cleanup-recordings")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }: { request: Request }) => {
        // Anyone can POST — the endpoint only deletes what's already past retention,
        // so it's safe to be idempotent/public. We still gate lightly on the anon key.
        const key = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (expected && key !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString();

          const { data: rows, error } = await supabaseAdmin
            .from("recordings")
            .select("id, storage_path")
            .lt("created_at", cutoff)
            .limit(500);
          if (error) throw new Error(error.message);

          const paths = (rows ?? []).map((r) => r.storage_path).filter(Boolean);
          if (paths.length > 0) {
            await supabaseAdmin.storage.from("recordings").remove(paths);
            await supabaseAdmin
              .from("recordings")
              .delete()
              .in(
                "id",
                (rows ?? []).map((r) => r.id),
              );
          }
          return new Response(
            JSON.stringify({ ok: true, deleted: paths.length, cutoff }),
            { headers: { "Content-Type": "application/json", ...CORS } },
          );
        } catch (err) {
          return new Response(
            JSON.stringify({ error: (err as Error).message }),
            { status: 500, headers: { "Content-Type": "application/json", ...CORS } },
          );
        }
      },
    },
  },
} as any);
