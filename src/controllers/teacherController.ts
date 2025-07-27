import { FastifyRequest, FastifyReply } from "fastify";
import { db } from "../db";
import { eventStaffAssignments } from "../db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Handles the GET /teachers/requests/pending route.
 * Fetches a list of all pending event staff requests for the currently logged-in teacher.
 * This route is accessible only by a 'teacher'.
 */
export async function getPendingStaffRequests(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { id: teacherId } = request.user;

  // 2. Fetch all assignments for this teacher that are currently 'pending'
  const pendingRequests = await db.query.eventStaffAssignments.findMany({
    where: and(
      eq(eventStaffAssignments.userId, teacherId),
      eq(eventStaffAssignments.status, "pending")
    ),
    with: {
      event: {
        columns: {
          id: true,
          name: true,
          description: true,
          startTime: true,
          endTime: true,
        },
        with: {
          // Also include the name of the organizer (the Forum Head who made the request)
          organizer: {
            columns: {
              fullName: true,
            },
          },
          // And the venue details
          venue: {
            columns: {
              name: true,
              locationDetails: true,
            },
          },
        },
      },
    },
    orderBy: (eventStaffAssignments, { asc }) => [
      asc(eventStaffAssignments.createdAt),
    ],
  });

  return reply.send(pendingRequests);
}

/**
 * Handles the POST /teachers/requests/:assignmentId/accept route.
 * Allows a teacher to accept a pending event staff request.
 */
export async function acceptStaffRequest(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // 1. Authorization: Get teacher's ID from JWT
  const { id: teacherId } = request.user;
  const { assignmentId } = request.params as { assignmentId: string };

  try {
    const updatedAssignment = await db.transaction(async (tx) => {
      // Step A: Find the specific pending assignment for this teacher
      const assignmentToAccept = await tx.query.eventStaffAssignments.findFirst(
        {
          where: and(
            eq(eventStaffAssignments.id, assignmentId),
            eq(eventStaffAssignments.userId, teacherId),
            eq(eventStaffAssignments.status, "pending")
          ),
          with: { event: true },
        }
      );

      if (!assignmentToAccept) {
        throw new Error(
          "Pending request not found or you are not authorized to accept it."
        );
      }

      const eventToJoin = assignmentToAccept.event as {
        startTime: Date;
        endTime: Date;
      };

      // Step B: Final Conflict Check. Re-verify the teacher's schedule.
      const teacherAcceptedAssignments =
        await tx.query.eventStaffAssignments.findMany({
          where: and(
            eq(eventStaffAssignments.userId, teacherId),
            eq(eventStaffAssignments.status, "approved")
          ),
          with: { event: true },
        });

      for (const assignment of teacherAcceptedAssignments) {
        const existingEvent = assignment.event as {
          name: string;
          startTime: Date;
          endTime: Date;
        };
        const isOverlapping =
          eventToJoin.startTime < existingEvent.endTime &&
          eventToJoin.endTime > existingEvent.startTime;

        if (isOverlapping) {
          throw new Error(
            `Conflict: You are already assigned to another event ('${existingEvent.name}') at this time.`
          );
        }
      }

      // Step C: If no conflicts, update the status to 'accepted'
      const [result] = await tx
        .update(eventStaffAssignments)
        .set({ status: "approved" })
        .where(eq(eventStaffAssignments.id, assignmentId))
        .returning();

      return result;
    });

    return {
      message: "Request accepted successfully.",
      assignment: updatedAssignment,
    };
  } catch (error: any) {
    if (error.message.includes("Conflict")) {
      return reply.code(409).send({ error: error.message });
    }
    if (error.message.includes("not found")) {
      return reply.code(404).send({ error: error.message });
    }
    console.error("Error accepting request:", error);
    return reply.code(500).send({ error: "An unexpected error occurred." });
  }
}

/**
 * Handles the POST /teachers/requests/:assignmentId/reject route.
 * Allows a teacher to reject a pending event staff request.
 */
export async function rejectStaffRequest(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // 1. Authorization: Get teacher's ID and role from JWT
  const { id: teacherId } = request.user;
  const { assignmentId } = request.params as { assignmentId: string };

  // 2. Find the specific pending assignment for this teacher
  const assignmentToReject = await db.query.eventStaffAssignments.findFirst({
    where: and(
      eq(eventStaffAssignments.id, assignmentId),
      eq(eventStaffAssignments.userId, teacherId),
      eq(eventStaffAssignments.status, "pending")
    ),
  });

  if (!assignmentToReject) {
    return reply.code(404).send({
      error:
        "Pending request not found or you are not authorized to reject it.",
    });
  }

  // 3. Update the status to 'rejected'
  const [updatedAssignment] = await db
    .update(eventStaffAssignments)
    .set({ status: "rejected" })
    .where(eq(eventStaffAssignments.id, assignmentId))
    .returning();

  return {
    message: "Request rejected successfully.",
    assignment: updatedAssignment,
  };
}

/**
 * Handles the GET /teachers/events/accepted route.
 * Fetches a list of all events for which the currently logged-in teacher
 * has an 'accepted' staff assignment.
 */
export async function getAcceptedEvents(request: FastifyRequest) {
  // 1. Authorization: Ensure the user is a Teacher
  const { id: teacherId } = request.user;

  // 2. Fetch all 'accepted' assignments for this teacher
  const acceptedAssignments = await db.query.eventStaffAssignments.findMany({
    where: and(
      eq(eventStaffAssignments.userId, teacherId),
      eq(eventStaffAssignments.status, "approved")
    ),
    with: {
      // Include the full details of the event for each accepted assignment
      event: {
        with: {
          venue: {
            columns: {
              name: true,
              locationDetails: true,
            },
          },
          organizer: {
            columns: {
              fullName: true,
            },
          },
        },
      },
    },
    orderBy: (eventStaffAssignments, { asc }) => [
      asc(eventStaffAssignments.createdAt),
    ],
  });

  // 3. Format the response to return a clean list of events
  const eventsList = acceptedAssignments
    .filter((assignment) => !!assignment.event)
    .map((assignment) => {
      const event = assignment.event as Record<string, any>;
      return {
        ...event,
        myAssignmentRole: assignment.assignmentRole,
      };
    });

  return eventsList;
}

/**
 * Handles the POST /teachers/requests/:assignmentId/cancel route.
 * Allows a teacher to cancel their 'accepted' assignment for an event.
 * This effectively removes them from the event staff.
 */
export async function cancelStaffRequest(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // 1. Authorization: Get teacher's ID from JWT
  const { id: teacherId } = request.user;
  const { assignmentId } = request.params as { assignmentId: string };

  // 2. Find the specific 'accepted' assignment for this teacher
  const assignmentToCancel = await db.query.eventStaffAssignments.findFirst({
    where: and(
      eq(eventStaffAssignments.id, assignmentId),
      eq(eventStaffAssignments.userId, teacherId),
      eq(eventStaffAssignments.status, "approved")
    ),
  });

  if (!assignmentToCancel) {
    return reply
      .code(404)
      .send({
        error:
          "Accepted assignment not found or you are not authorized to cancel it.",
      });
  }

  await db
    .delete(eventStaffAssignments)
    .where(eq(eventStaffAssignments.id, assignmentId));

  return {
    message: "Your assignment to the event has been successfully cancelled.",
  };
}
