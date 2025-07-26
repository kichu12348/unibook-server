import { FastifyRequest, FastifyReply } from "fastify";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { colleges } from "../db/schema";

export async function checkHasPaid(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { collegeId } = request.user;

  if (!collegeId) {
    return reply.code(400).send({ error: "College ID is required." });
  }
  const getCollege = await db.query.colleges.findFirst({
    where: eq(colleges.id, collegeId),
    columns: { hasPaid: true },
  });

  if (!getCollege) {
    return reply.code(404).send({ error: "College not found." });
  }

  if (!getCollege.hasPaid) {
    return reply.code(403).send({ error: "Forbidden: College not allowed" });
  }
  return true;
}
