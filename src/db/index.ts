import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as dotenv from "dotenv";
import * as schema from "./schema";
import fs from "fs";

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

// Create the connection
const client = postgres(connectionString,{
  ssl:{
    ca: fs.readFileSync("../../ca.pem").toString(),
  }
});

// Create the database instance
export const db = drizzle(client, { schema });

// Export the client for manual queries if needed
export { client };
