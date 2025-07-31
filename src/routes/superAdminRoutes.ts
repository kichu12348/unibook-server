import { FastifyInstance } from "fastify";
import {
  createCollege,
  getCollegeById,
  getColleges,
  updateCollege,
  createCollegeAdmin,
  getCollegeAdmins
} from "../controllers/superAdminController";
import { verifyToken } from "../middlewares/authMiddleware";
import { verifySuperAdmin } from "../middlewares/checkRole";

const createCollegeSchema = {
  body: {
    type: "object",
    required: ["name", "domainName"],
    properties: {
      name: { type: "string" },
      domainName: { type: "string" },
    },
  },
};

const updateCollegeSchema = {
  body: {
    type: "object",
    properties: {
      name: { type: "string" },
      domainName: { type: "string" },
      hasPaid: { type: "boolean" },
    },
  },
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string" },
    },
  },
};

const createCollegeAdminSchema = {
  body: {
    type: "object",
    required: ["fullName", "email", "password"],
    properties: {
      fullName: { type: "string" },
      email: { type: "string", format: "email" },
      password: { type: "string", minLength: 8 },
    },
  },
  params: {
    type: "object",
    required: ["collegeId"],
    properties: {
      collegeId: { type: "string" },
    },
  },
};

export default async function superAdminRoutes(
  app: FastifyInstance
): Promise<void> {

  app.addHook("onRequest", verifyToken);
  app.addHook("preHandler", verifySuperAdmin);

  app.post("/colleges", { schema: createCollegeSchema }, createCollege);
  app.get("/colleges", getColleges);
  app.get("/colleges/:id", getCollegeById);
  app.put("/colleges/:id/update", { schema: updateCollegeSchema }, updateCollege);
  app.post("/colleges/:collegeId/admins", { schema: createCollegeAdminSchema }, createCollegeAdmin);
  app.get("/colleges/:collegeId/admins", getCollegeAdmins);
}
