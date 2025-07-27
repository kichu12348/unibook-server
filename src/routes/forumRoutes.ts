import { FastifyInstance } from "fastify";
import {
  approveForumHead,
  createEvent,
  deleteEvent,
  getEventById,
  getEvents,
  getPendingForumHeads,
  rejectForumHead,
  removeStaffFromEvent,
  requestStaffForEvent,
  updateEvent,
} from "../controllers/forumController";

const createForumSchema = {
  body: {
    type: "object",
    required: ["name", "startTime", "endTime"],
    properties: {
      name: { type: "string" },
      description: { type: "string", nullable: true },
      startTime: { type: "string", format: "date-time" },
      endTime: { type: "string", format: "date-time" },
      venueId: { type: "string", nullable: true },
      registrationLink: { type: "string", nullable: true },
      bannerImage: { type: "string", nullable: true },
    },
  },
};

const updateForumSchema = {
  params: {
    type: "object",
    properties: {
      eventId: { type: "string" },
    },
  },
  body: {
    type: "object",
    properties: {
      name: { type: "string", nullable: true },
      description: { type: "string", nullable: true },
      startTime: { type: "string", format: "date-time", nullable: true },
      endTime: { type: "string", format: "date-time", nullable: true },
      venueId: { type: "string", nullable: true },
      registrationLink: { type: "string", nullable: true },
      bannerImage: { type: "string", nullable: true },
    },
  },
};

const approveOrRejectForumHeadSchema = {
  params: {
    type: "object",
    properties: {
      userId: { type: "string" },
    },
  },
};

const requestStaffForEventSchema = {
  params: {
    type: "object",
    properties: {
      eventId: { type: "string" },
    },
    required: ["eventId"],
  },
  body: {
    type: "object",
    properties: {
      userId: { type: "string" },
      assignmentRole: { type: "string" },
    },
    required: ["userId"],
  },
};

const deleteEventSchema = {
  params: {
    type: "object",
    properties: {
      eventId: { type: "string" },
    },
    required: ["eventId"],
  },
};

const removeStaffFromEventSchema = {
  params: {
    type: "object",
    properties: {
      eventId: { type: "string" },
      staffUserId: { type: "string" },
    },
    required: ["eventId", "staffUserId"],
  },
};

export default async function forumRoutes(app: FastifyInstance): Promise<void> {
  app.post("/events", { schema: createForumSchema }, createEvent);
  app.get("/events", getEvents);
  app.get("/events/:eventId", getEventById);
  app.put("/events/:eventId", { schema: updateForumSchema }, updateEvent);
  app.get("/heads/pending", getPendingForumHeads);
  app.post(
    "/heads/:userId/approve",
    { schema: approveOrRejectForumHeadSchema },
    approveForumHead
  );
  app.post(
    "/heads/:userId/reject",
    { schema: approveOrRejectForumHeadSchema },
    rejectForumHead
  );
  app.post(
    "/events/:eventId/staff",
    { schema: requestStaffForEventSchema },
    requestStaffForEvent
  );
  app.delete("/events/:eventId", { schema: deleteEventSchema }, deleteEvent);
  app.delete(
    "/events/:eventId/staff/:staffUserId",
    { schema: removeStaffFromEventSchema },
    removeStaffFromEvent
  );
}
