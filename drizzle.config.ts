import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";

if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
    ssl: {
      rejectUnauthorized: false,
    },
  },

  verbose: true,
  strict: true,
});
