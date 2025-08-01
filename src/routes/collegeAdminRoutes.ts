import { FastifyInstance } from "fastify";
import {
  getUsersForCollegeAdmin,
  approveUser,
  rejectUser,
  deleteUser,
  createVenue,
  createForum,
  getForums,
  updateForum,
  searchUsersForCollegeAdmin,
  getForumById,
  getVenues,
  getVenueById,
  updateVenue,
  deleteForum,
  deleteVenue,
} from "../controllers/collegeAdminController";

import { checkHasPaid } from "../middlewares/checkHasPaid";
import { verifyToken } from "../middlewares/authMiddleware";
import { verifyCollegeAdmin } from "../middlewares/checkRole";

const approveOrRejectOrDeleteSchema = {
  params: {
    type: "object",
    properties: {
      userId: { type: "string" },
    },
    required: ["userId"],
  },
  body: {
    type: "object",
    properties: {
      forumId: { type: "string" },
    },
    required: [],
  },
};

const venueSchema = {
  body: {
    type: "object",
    properties: {
      name: { type: "string" },
      capacity: { type: "number" },
      locationDetails: { type: "string" },
    },
    required: ["name", "capacity", "locationDetails"],
  },
};

const forumSchema = {
  body: {
    type: "object",
    properties: {
      name: { type: "string" },
      description: { type: "string" },
      headIds: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["name"],
  },
  response: {
    201: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
      },
    },
    400: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
    403: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
  },
};

export default async function collegeAdminRoutes(app: FastifyInstance) {
  app.addHook("onRequest", verifyToken);
  app.addHook("preHandler", verifyCollegeAdmin);

  app.get("/users", getUsersForCollegeAdmin);
  app.put(
    "/users/:userId/approve",
    { schema: approveOrRejectOrDeleteSchema, preHandler: [checkHasPaid] },
    approveUser
  );
  app.put(
    "/users/:userId/reject",
    { schema: approveOrRejectOrDeleteSchema, preHandler: [checkHasPaid] },
    rejectUser
  );
  app.delete(
    "/users/:userId",
    { schema: approveOrRejectOrDeleteSchema, preHandler: [checkHasPaid] },
    deleteUser
  );
  app.post(
    "/venues",
    { schema: venueSchema, preHandler: [checkHasPaid] },
    createVenue
  );
  app.post(
    "/forums",
    { schema: forumSchema, preHandler: [checkHasPaid] },
    createForum
  );
  app.put(
    "/forums/:forumId/update",
    { preHandler: [checkHasPaid] },
    updateForum
  );
  app.get("/forums", getForums);
  app.get("/forums/:forumId", getForumById);
  app.get("/users/search", searchUsersForCollegeAdmin);
  app.get("/venues", getVenues);
  app.get("/venues/:venueId", getVenueById);
  app.put("/venues/:venueId/update",{ preHandler: [checkHasPaid] }, updateVenue);
  app.delete("/forums/:forumId", { preHandler: [checkHasPaid] }, deleteForum);
  app.delete("/venues/:venueId", { preHandler: [checkHasPaid] }, deleteVenue);
}
