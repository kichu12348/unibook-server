import { FastifyRequest,FastifyReply } from "fastify";

export async function verifySuperAdmin(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const user = request.user;

  if (!user || user.role !== "super_admin") {
    return reply.code(403).send({ error: "Forbidden: You aint allowed here boi" });
  }
  return;
}

export async function verifyCollegeAdmin(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const user = request.user;

  if (!user || user.role !== "college_admin") {
    return reply.code(403).send({ error: "Forbidden: You aint allowed here boi onli college admins" });
  }
  return;
}

export async function verifyForumHead(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const user = request.user;

  if (!user || user.role !== "forum_head") {
    return reply.code(403).send({ error: "Forbidden: You aint allowed here boi onli forum heads" });
  }
  return;
}