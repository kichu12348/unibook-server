import { FastifyRequest, FastifyReply } from "fastify";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { db } from "../db";
import { users, colleges, superAdmins, forum_heads } from "../db/schema";
import { eq, and, gt } from "drizzle-orm";
import {
  LoginUserBody,
  RegisterUserBody,
  VerifyEmailBody,
} from "./utils/types";
import { sendOtpEmail } from "../utils/email";

export async function registerUser(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { fullName, email, password, role, collegeId, forumId } =
    request.body as RegisterUserBody;

  if (!["student", "teacher", "forum_head"].includes(role)) {
    return reply.code(400).send({ error: "Invalid role for registration." });
  }
  if (!collegeId || !fullName || !email || !password) {
    return reply.code(400).send({ error: "All fields are required." });
  }

  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (existingUser) {
    return reply
      .code(409)
      .send({ error: "A user with this email already exists." });
  }

  const college = await db.query.colleges.findFirst({
    where: eq(colleges.id, collegeId),
  });

  if (!college || !college.domainName) {
    return reply.code(400).send({ error: "Invalid college selected." });
  }

  const userDomain = email.split("@")[1];
  if (userDomain !== college.domainName) {
    return reply.code(400).send({
      error: `Your email domain must match the selected college's domain (${college.domainName}).`,
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const approvalStatus = role === "student" ? "approved" : "pending";

  const [newUser] = await db
    .insert(users)
    .values({
      fullName,
      email,
      passwordHash,
      role,
      collegeId: college.id,
      approvalStatus,
      isEmailVerified: false,
    })
    .returning({ id: users.id, email: users.email });

  if (forumId) {
    await db.insert(forum_heads).values({
      userId: newUser.id,
      forumId,
      isVerified: false, // Initially not verified
    });
  }

  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  console.log(`Generated OTP for ${email}: ${otp}`);
  const expires = new Date(Date.now() + 10 * 60 * 1000);
  const hashedOtp = await bcrypt.hash(otp, 10);
  await db
    .update(users)
    .set({
      emailVerificationToken: hashedOtp,
      emailVerificationExpires: expires,
    })
    .where(eq(users.id, newUser.id));

  await sendOtpEmail(newUser.email, otp);

  return reply.code(201).send({
    message:
      "Registration successful. Please check your email for a verification code.",
  });
}

export async function verifyOtpAndLogin(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { email, otp } = request.body as VerifyEmailBody;

  if (!email || !otp) {
    return reply.code(400).send({ error: "Email and OTP are required." });
  }

  const user = await db.query.users.findFirst({
    where: and(
      eq(users.email, email),
      gt(users.emailVerificationExpires, new Date())
    ),
  });

  if (!user || !user.emailVerificationToken) {
    return reply
      .code(400)
      .send({ error: "Invalid OTP or request has expired." });
  }
  const isOtpValid = await bcrypt.compare(otp, user.emailVerificationToken);

  if (!isOtpValid) {
    return reply.code(400).send({ error: "Invalid OTP." });
  }
  const [updatedUser] = await db
    .update(users)
    .set({
      isEmailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
      approvalStatus: user.role === "student" ? "approved" : "pending",
    })
    .where(eq(users.id, user.id))
    .returning();
  if (updatedUser.approvalStatus === "approved") {
    const jwtToken = request.server.jwt.sign({
      id: updatedUser.id,
      role: updatedUser.role,
      collegeId: updatedUser.collegeId,
    });
    return {
      message: "Email verified successfully.",
      token: jwtToken,
    };
  } else {
    return reply.code(403).send({
      message:
        "Your account has been verified, but is pending approval by the college admin.",
      code: "PENDING_APPROVAL",
    });
  }
}

export async function login(request: FastifyRequest, reply: FastifyReply) {
  const { email, password } = request.body as LoginUserBody;

  if (!email || !password) {
    return reply.code(400).send({ error: "Email and password are required." });
  }

  //Check if the user is a Super Admin first
  const potentialSuperAdmin = await db.query.superAdmins.findFirst({
    where: eq(superAdmins.email, email),
  });

  if (potentialSuperAdmin) {
    const match = await bcrypt.compare(
      password,
      potentialSuperAdmin.passwordHash
    );
    if (match) {
      const token = request.server.jwt.sign({
        id: potentialSuperAdmin.id,
        role: "super_admin",
      });
      return { token };
    }
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user) {
    return reply.code(401).send({ error: "Invalid credentials." });
  }

  if (!user.isEmailVerified) {
    return reply.code(403).send({
      error:
        "Your account is not verified. Please complete the OTP verification process.",
      code: "NOT_VERIFIED",
    });
  }
  if (user.approvalStatus !== "approved") {
    return reply.code(403).send({
      error: "Your account is pending approval from the college admin.",
      code: "PENDING_APPROVAL",
    });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (match) {
    const token = request.server.jwt.sign({
      id: user.id,
      role: user.role,
      collegeId: user.collegeId,
    });
    return { token };
  }

  return reply.code(401).send({ error: "Invalid credentials." });
}

export async function getMe(request: FastifyRequest, reply: FastifyReply) {
  const { id: userId, role } = request.user;

  if (role === "super_admin") {
    const superAdminProfile = await db.query.superAdmins.findFirst({
      where: eq(superAdmins.id, userId),
      columns: {
        id: true,
        fullName: true,
        email: true,
        createdAt: true,
      },
    });
    if (!superAdminProfile) {
      return reply.code(404).send({ error: "Super admin profile not found." });
    }
    return { ...superAdminProfile, role: "super_admin" };
  }

  const userProfile = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      collegeId: true,
      approvalStatus: true,
      isEmailVerified: true,
      createdAt: true,
    },
  });

  if (!userProfile) {
    return reply.code(404).send({ error: "User not found." });
  }

  return userProfile;
}
