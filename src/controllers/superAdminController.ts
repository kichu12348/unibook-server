import { FastifyRequest, FastifyReply } from "fastify";
import { db } from "../db";
import { colleges, superAdmins, users } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { CreateCollegeAdminBody, CreateCollegeBody } from "./utils/types";
import bcrypt from "bcrypt";

/**
 * Handles the POST /sa/colleges route.
 * Creates a new college tenant.
 * This route must be protected and only accessible by a 'super_admin'.
 */
export async function createCollege(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { name, domainName } = request.body as CreateCollegeBody;

  if (!name || !domainName) {
    return reply
      .code(400)
      .send({ error: "College name and domain name are required." });
  }

  const existingCollege = await db.query.colleges.findFirst({
    where: eq(colleges.domainName, domainName),
  });

  if (existingCollege) {
    return reply
      .code(409)
      .send({ error: "A college with this domain name already exists." });
  }

  const newCollege = await db
    .insert(colleges)
    .values({
      name,
      domainName,
      hasPaid: true,
    })
    .returning();

  return reply.code(201).send(newCollege);
}

export async function getColleges(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const collegeList = await db.query.colleges.findMany({
    orderBy: (colleges, { desc }) => [desc(colleges.createdAt)],
  });
  return reply.code(200).send(collegeList);
}

export async function getCollegeById(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const collegeId = request.params.id;

  const college = await db.query.colleges.findFirst({
    where: eq(colleges.id, collegeId),
  });

  if (!college) {
    return reply.code(404).send({ error: "College not found." });
  }

  return reply.code(200).send(college);
}

export async function updateCollege(
  request: FastifyRequest<{
    Params: { id: string };
    Body: { name?: string; domainName?: string; hasPaid?: boolean };
  }>,
  reply: FastifyReply
) {
  const collegeId = request.params.id;
  const { name, domainName, hasPaid } = request.body;

  const college = await db.query.colleges.findFirst({
    where: eq(colleges.id, collegeId),
  });

  if (!college) {
    return reply.code(404).send({ error: "College not found." });
  }

  const updatedCollege = await db
    .update(colleges)
    .set({
      name,
      domainName,
      hasPaid,
    })
    .where(eq(colleges.id, collegeId))
    .returning();

  return reply.code(200).send(updatedCollege);
}

export async function createCollegeAdmin(
  request: FastifyRequest<{
    Params: { collegeId: string };
    Body: CreateCollegeAdminBody;
  }>,
  reply: FastifyReply
) {
  const { collegeId } = request.params;
  const { fullName, email, password } = request.body;

  if (!fullName || !email || !password) {
    return reply
      .code(400)
      .send({ error: "fullName, email, and password are required." });
  }

  const college = await db.query.colleges.findFirst({
    where: eq(colleges.id, collegeId),
  });

  if (!college) {
    return reply.code(404).send({ error: "College not found." });
  }

  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (existingUser) {
    return reply
      .code(409)
      .send({ error: "A user with this email already exists." });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [newAdmin] = await db
    .insert(users)
    .values({
      fullName,
      email,
      passwordHash,
      collegeId,
      role: "college_admin",
      // Admins created by Super Admin are auto-approved and verified
      approvalStatus: "approved",
      isEmailVerified: true,
    })
    .returning({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      role: users.role,
    });

  return reply.code(201).send(newAdmin);
}

export async function getCollegeAdmins(
  request: FastifyRequest<{ Params: { collegeId: string } }>,
  reply: FastifyReply
) {
  const { collegeId } = request.params;

  const admins = await db.query.users.findMany({
    where: and(eq(users.collegeId, collegeId), eq(users.role, "college_admin")),
    orderBy: (users, { desc }) => [desc(users.createdAt)],
    columns: {
      id: true,
      fullName: true,
      email: true,
      role: true,
    },
  });

  return reply.code(200).send(admins);
}

async function createATestSuperAdmin() {
  const email = "kichu@gm.com";
  const password = "kichu12348";
  const fullName = "Test";
  const passwordHash = await bcrypt.hash(password, 10);
  await db
    .insert(superAdmins)
    .values({
      fullName,
      email,
      passwordHash,
    })
    .onConflictDoNothing()
    .returning({
      id: superAdmins.id,
      fullName: superAdmins.fullName,
      email: superAdmins.email,
    });
}

createATestSuperAdmin()
  .then(() => console.log("Test Super Admin created successfully"))
  .catch((error) => console.error("Error creating Test Super Admin:", error));