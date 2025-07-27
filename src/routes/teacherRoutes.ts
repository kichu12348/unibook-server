import { FastifyInstance } from "fastify";
import {
  getPendingStaffRequests,
  acceptStaffRequest,
  rejectStaffRequest,
  getAcceptedEvents,
  cancelStaffRequest,
} from "../controllers/teacherController";

const acceptOrRejectSchema = {
  params: {
    type: "object",
    properties: {
      assignmentId: { type: "string" },
    },
    required: ["assignmentId"],
  },
};

const cancelRequestSchema = {
  params: {
    type: "object",
    properties: {
      assignmentId: { type: "string" },
    },
    required: ["assignmentId"],
  },
};

export default async function teacherRoutes(app: FastifyInstance) {
  app.get("/requests/pending", getPendingStaffRequests);
  app.post(
    "/requests/:assignmentId/accept",
    { schema: acceptOrRejectSchema },
    acceptStaffRequest
  );
  app.post(
    "/requests/:assignmentId/reject",
    { schema: acceptOrRejectSchema },
    rejectStaffRequest
  );
  app.get("/events/accepted", getAcceptedEvents);
  app.post(
    "/requests/:assignmentId/cancel",
    { schema: cancelRequestSchema },
    cancelStaffRequest
  );
}
