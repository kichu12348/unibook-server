import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config();

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
    ssl:{
      rejectUnauthorized: true,
      ca:process.env.CA_CERT?.trim()
    }
  },

  verbose: true,
  strict: true,
});
