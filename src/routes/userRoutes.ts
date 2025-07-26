import { FastifyInstance } from "fastify";
import {
  getMe,
  registerUser,
  verifyOtpAndLogin,
  login,
} from "../controllers/userController";
import { verifyToken } from "../middlewares/authMiddleware";

const userSchema = {
  body: {
    type: "object",
    required: ["fullName", "email", "password", "collegeId", "role"],
    properties: {
      fullName: { type: "string" },
      email: { type: "string", format: "email" },
      password: { type: "string", minLength: 8 },
      collegeId: { type: "string" },
      forumId: { type: "string" },
      role: {
        type: "string",
        enum: ["student", "teacher", "forum_head"],
      },
    },
  },
  response: {
    201: {
      type: "object",
      properties: {
        message: { type: "string" },
      },
    },
    400: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
    409: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
    500: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
  },
};

const verifyEmailSchema = {
  body: {
    type: "object",
    required: ["email", "otp"],
    properties: {
      email: { type: "string", format: "email" },
      otp: { type: "string", minLength: 4, maxLength: 4 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        message: { type: "string" },
        token: { type: "string" },
      },
    },
    403: {
      type: "object",
      properties: {
        message: { type: "string" },
        code: { type: "string" },
      },
    },
    400: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
    500: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
  },
};

const loginSchema = {
  body: {
    type: "object",
    required: ["email", "password"],
    properties: {
      email: { type: "string", format: "email" },
      password: { type: "string", minLength: 8 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        token: { type: "string" },
      },
    },
    400: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
    401: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
    403: {
      type: "object",
      properties: {
        error: { type: "string" },
        code: { type: "string" },
      },
    },
    404: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
    500: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
  },
};

export default async function userRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/register",
    {
      schema: userSchema,
    },
    registerUser
  );

  app.post(
    "/verify-email",
    {
      schema: verifyEmailSchema,
    },
    verifyOtpAndLogin
  );

  app.post(
    "/login",
    {
      schema: loginSchema,
    },
    login
  );

  app.get(
    "/me",
    {
      onRequest: [verifyToken],
    },
    getMe
  );
}
