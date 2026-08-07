import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

// `db` is null until DATABASE_URL is set (copy .env.example to .env.local).
// Callers must handle the null case rather than assuming a live connection.
const client = connectionString ? postgres(connectionString, { prepare: false }) : null;

export const db = client ? drizzle(client, { schema }) : null;
