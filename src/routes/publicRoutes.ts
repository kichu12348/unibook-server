import { FastifyInstance } from "fastify";
import {
  getPublicEventById,
  getPublicEvents,
  getPublicForums,
  getForumById,
  getMyCollegeDetails,
} from "../controllers/publicController";

const eventSchema = {
  params: {
    type: "object",
    properties: {
      eventId: { type: "string" },
    },
    required: ["eventId"],
  },
};

const forumSchema = {
  params: {
    type: "object",
    properties: {
      forumId: { type: "string" },
    },
    required: ["forumId"],
  },
};

export default async function publicRoutes(app: FastifyInstance) {
  app.get("/events", getPublicEvents);
  app.get("/events/:eventId", { schema: eventSchema }, getPublicEventById);
  app.get("/forums", getPublicForums);
  app.get("/forums/:forumId", { schema: forumSchema }, getForumById);
  app.get("/colleges/me", getMyCollegeDetails);
}
