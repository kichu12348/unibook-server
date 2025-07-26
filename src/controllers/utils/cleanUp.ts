import { db } from "../../db";
import { users } from "../../db/schema";
import { eq, and, lte } from "drizzle-orm";

export async function cleanupUnverifiedUsers() {

  try {
    await db
      .delete(users)
      .where(
        and(
          eq(users.isEmailVerified, false),
          lte(users.emailVerificationExpires, new Date()) // Check if the email verification has expired by comparing the expiration date with the current date
        )
      );
  } catch (error) {
    console.error("Error during unverified user cleanup:", error);
  }
}
