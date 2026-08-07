import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { DATABASE_URL } from "@/lib/config";

import * as schema from "./schema";

/**
 * The Neon HTTP driver issues each query as a stateless HTTP request, so
 * there is no connection pool to exhaust — the failure mode that kills naive
 * Postgres-on-serverless setups (SPEC §3). Nothing here needs disposing, which
 * is why this is a module-level constant rather than a factory.
 */
export const db = drizzle(neon(DATABASE_URL), { schema });
