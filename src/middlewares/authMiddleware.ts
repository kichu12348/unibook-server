import { FastifyRequest,FastifyReply } from "fastify";

export async function verifyToken(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    await request.jwtVerify();
  } catch (err) {
    console.error("JWT verification failed:", err);
    return reply.status(401).send({ error: "Unauthorized access bad boi 🤨" });
  }
}