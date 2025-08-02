import { FastifyRequest, FastifyReply } from "fastify";
import { db } from "../db";
import {
  events,
  forum_heads,
  users,
  eventStaffAssignments,
  venues,
} from "../db/schema";
import { and, eq, gte, lte, or, not, inArray, ilike, ne } from "drizzle-orm";

/**
 * Handles the POST /events route.
 * Creates a new event for the college.
 * This route is accessible only by 'forum_head'.
 */
export async function createEvent(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { id: organizerId, collegeId } = request.user;

  const {
    name,
    description,
    startTime,
    endTime,
    venueId,
    registrationLink,
    bannerImage,
    resizeMode,
    forumId,
  } = request.body as {
    name: string;
    description?: string;
    startTime: string;
    endTime: string;
    venueId?: string;
    registrationLink?: string;
    bannerImage?: string;
    resizeMode?: string;
    forumId: string;
  };

  if (!name || !startTime || !endTime) {
    return reply
      .code(400)
      .send({ error: "Event name, start time, and end time are required." });
  }

  const start = new Date(startTime);
  const end = new Date(endTime);

  if (start >= end) {
    return reply
      .code(400)
      .send({ error: "End time must be after start time." });
  }
  try {
    const newEvent = await db.transaction(async (tx) => {
      if (venueId) {
        const conflictingEvents = await tx.query.events.findFirst({
          where: and(
            eq(events.venueId, venueId),
            or(
              and(gte(events.startTime, start), lte(events.startTime, end)),
              and(gte(events.endTime, start), lte(events.endTime, end)),
              and(lte(events.startTime, start), gte(events.endTime, end))
            )
          ),
        });

        if (conflictingEvents) {
          throw new Error(
            "This venue is already booked for the selected time. Please choose a different time or venue."
          );
        }
      }

      if (!collegeId) {
        throw new Error("College ID is required.");
      }

      const [createdEvent] = await tx
        .insert(events)
        .values({
          name,
          description,
          startTime: start,
          endTime: end,
          venueId,
          organizerId,
          collegeId,
          registrationLink,
          resizeMode,
          bannerImage,
          forumId,
          status: "confirmed",
        })
        .returning();
      if (venueId) {
        const venue = await tx.query.venues.findFirst({
          where: eq(venues.id, venueId),
          columns: {
            name: true,
            locationDetails: true,
          },
        });

        return { ...createdEvent, venue };
      }
      return createdEvent;
    });

    return reply.code(201).send(newEvent);
  } catch (error: any) {
    if (error.message.includes("already booked")) {
      return reply.code(409).send({ error: error.message });
    }
    console.error("Error creating event:", error);
    return reply.code(500).send({
      error: "An unexpected error occurred while creating the event.",
    });
  }
}

/**
 * Handles the GET /events route.
 * Fetches a list of all upcoming events for the user's college.
 * This route is accessible by any authenticated user within a college.
 */
export async function getEvents(request: FastifyRequest, reply: FastifyReply) {
  const { collegeId } = request.user;

  if (!collegeId) {
    return reply
      .code(403)
      .send({ error: "Forbidden: No college associated with this account." });
  }

  const collegeEvents = await db.query.events.findMany({
    where: and(
      eq(events.collegeId, collegeId),
      gte(events.endTime, new Date())
    ),
    with: {
      venue: {
        columns: {
          name: true,
          locationDetails: true,
        },
      },
      organizer: {
        columns: {
          id: true,
          fullName: true,
        },
      },
    },
    orderBy: (events, { asc }) => [asc(events.startTime)],
  });

  return collegeEvents;
}

/**
 * Handles the GET /events/:eventId route.
 * Fetches the full details of a single event.
 * This route is accessible by any authenticated user within the college.
 */
export async function getEventById(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // 1. Get the user's collegeId from their JWT and the eventId from the URL
  const { collegeId } = request.user;
  const { eventId } = request.params as { eventId: string };

  if (!collegeId) {
    return reply
      .code(403)
      .send({ error: "Forbidden: No college associated with this account." });
  }

  const eventDetails = await db.query.events.findFirst({
    where: and(eq(events.id, eventId), eq(events.collegeId, collegeId)),
    with: {
      venue: {
        columns: {
          id: true,
          name: true,
          locationDetails: true,
          capacity: true,
        },
      },
      organizer: {
        columns: {
          id: true,
          fullName: true,
        },
      },
      forum: {
        columns: {
          id: true,
          name: true,
        },
      },
      staffAssignments: {
        with: {
          user: {
            columns: {
              id: true,
              fullName: true,
            },
          },
        },
      },
    },
  });

  if (!eventDetails) {
    return reply.code(404).send({ error: "Event not found." });
  }

  const formattedEvent = {
    ...eventDetails,
    staff: eventDetails.staffAssignments.map((assignment) => ({
      ...assignment.user,
      status: assignment.status,
      assignmentRole: assignment.assignmentRole || "",
    })),
  };
  delete (formattedEvent as any).staffAssignments;

  return formattedEvent;
}

/**
 * Handles the PUT /events/:eventId route.
 * Updates the details of a specific event.
 * This route is accessible only by 'forum_head'.
 */
export async function updateEvent(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { role, collegeId } = request.user;
  const { eventId } = request.params as { eventId: string };
  const updateData = request.body as Partial<{
    name: string;
    description: string;
    startTime: string;
    endTime: string;
    venueId: string | null;
    registrationLink: string | null;
    bannerImage: string | null;
    resizeMode: string | null;
  }>;

  if (!collegeId) {
    return reply
      .code(403)
      .send({ error: "Forbidden: No college associated with this account." });
  }

  // 2. Fetch the existing event from the database
  const existingEvent = await db.query.events.findFirst({
    where: and(eq(events.id, eventId), eq(events.collegeId, collegeId)),
  });

  if (!existingEvent) {
    return reply.code(404).send({ error: "Event not found." });
  }

  // 3. Authorization: Check if the user is a Forum Head
  if (role !== "forum_head") {
    return reply
      .code(403)
      .send({ error: "Forbidden: Only forum heads can update events." });
  }

  // 4. Use a transaction to ensure data integrity, especially for conflict checking
  try {
    const updatedEvent = await db.transaction(async (tx) => {
      // Step A: Check for scheduling conflicts if time or venue is changing
      const newStartTime = updateData.startTime
        ? new Date(updateData.startTime)
        : existingEvent.startTime;
      const newEndTime = updateData.endTime
        ? new Date(updateData.endTime)
        : existingEvent.endTime;
      const newVenueId =
        updateData.venueId !== undefined
          ? updateData.venueId
          : existingEvent.venueId;

      if (
        newVenueId &&
        (updateData.startTime || updateData.endTime || updateData.venueId)
      ) {
        const conflictingEvents = await tx.query.events.findFirst({
          where: and(
            eq(events.venueId, newVenueId),
            not(eq(events.id, eventId)), // Exclude the event itself from the check
            or(
              and(
                gte(events.startTime, newStartTime),
                lte(events.startTime, newEndTime)
              ),
              and(
                gte(events.endTime, newStartTime),
                lte(events.endTime, newEndTime)
              ),
              and(
                lte(events.startTime, newStartTime),
                gte(events.endTime, newEndTime)
              )
            )
          ),
        });

        if (conflictingEvents) {
          throw new Error(
            "This venue is already booked for the selected time."
          );
        }
      }

      // Step B: Update the event with the new data
      const [result] = await tx
        .update(events)
        .set({
          name: updateData.name,
          description: updateData.description,
          startTime: updateData.startTime
            ? new Date(updateData.startTime)
            : undefined,
          endTime: updateData.endTime
            ? new Date(updateData.endTime)
            : undefined,
          venueId: updateData.venueId,
          registrationLink: updateData.registrationLink,
          bannerImage: updateData.bannerImage,
          resizeMode: updateData.resizeMode || "cover",
        })
        .where(eq(events.id, eventId))
        .returning();

      return result;
    });

    return updatedEvent;
  } catch (error: any) {
    if (error.message.includes("already booked")) {
      return reply.code(409).send({ error: error.message });
    }
    console.error("Error updating event:", error);
    return reply.code(500).send({
      error: "An unexpected error occurred while updating the event.",
    });
  }
}

/**
 * Handles the GET /forums/heads/pending route.
 * Fetches a list of all users with a pending 'forum_head' role for the specific forums
 * the current user is a head of.
 * This route is accessible only by an approved 'forum_head'.
 */
export async function getPendingForumHeads(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // 1. Authorization: Ensure the user is an approved Forum Head
  const { id: currentUserId, collegeId } = request.user;
  if (!collegeId) {
    return reply
      .code(403)
      .send({ error: "Forbidden: No college associated with this account." });
  }

  // 2. Find which forums the current user is a head of
  const userForumAssignments = await db.query.forum_heads.findMany({
    where: eq(forum_heads.userId, currentUserId),
  });

  // If the user is not a head of any forums, they can't see any pending requests.
  if (userForumAssignments.length === 0) {
    return [];
  }

  const forumIds = userForumAssignments.map((assignment) => assignment.forumId);

  // 3. Find all user assignments for those specific forums
  const allHeadAssignmentsForForums = await db.query.forum_heads.findMany({
    where: inArray(forum_heads.forumId, forumIds),
  });

  const allHeadUserIds = allHeadAssignmentsForForums.map(
    (assignment) => assignment.userId
  );

  // 4. Fetch the user details for only those users who are pending approval
  const pendingHeads = await db.query.users.findMany({
    where: and(
      eq(users.collegeId, collegeId),
      inArray(users.id, allHeadUserIds),
      eq(users.approvalStatus, "pending"),
      eq(forum_heads.isVerified, false)
    ),
    columns: {
      id: true,
      fullName: true,
      email: true,
      createdAt: true,
    },
    orderBy: (users, { asc }) => [asc(users.createdAt)],
  });

  return pendingHeads;
}

/**
 * Handles the POST /forums/heads/:userId/approve route.
 * Allows an approved forum head to approve another pending forum head
 * for a forum they have in common.
 */
export async function approveForumHead(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // 1. Get the approver's details from their JWT and the target user's ID from the URL
  const { id: approverId, role: approverRole } = request.user;
  const { userId: targetUserId } = request.params as { userId: string };

  // 2. Authorization: Ensure the user is a Forum Head
  if (approverRole !== "forum_head") {
    return reply
      .code(403)
      .send({ error: "Forbidden: Only forum heads can approve users." });
  }

  // 3. Fetch the approver's and target user's full profiles and their forum assignments
  const [
    approver,
    targetUser,
    approverForumAssignments,
    targetForumAssignments,
  ] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, approverId) }),
    db.query.users.findFirst({ where: eq(users.id, targetUserId) }),
    db.query.forum_heads.findMany({
      where: eq(forum_heads.userId, approverId),
    }),
    db.query.forum_heads.findMany({
      where: eq(forum_heads.userId, targetUserId),
    }),
  ]);

  // 4. Validation Checks
  if (!approver || !targetUser) {
    return reply.code(404).send({ error: "User not found." });
  }
  if (approver.approvalStatus !== "approved") {
    return reply
      .code(403)
      .send({ error: "Forbidden: Your own account is not yet approved." });
  }
  if (
    targetUser.approvalStatus !== "pending" ||
    targetUser.role !== "forum_head"
  ) {
    return reply
      .code(400)
      .send({ error: "This user is not a pending forum head." });
  }
  if (approver.collegeId !== targetUser.collegeId) {
    return reply
      .code(403)
      .send({ error: "Forbidden: Cannot approve users outside your college." });
  }

  // 5. CRITICAL SECURITY CHECK: Find if they share at least one common forum
  const approverForumIds = new Set(
    approverForumAssignments.map((a) => a.forumId)
  );
  const targetHasCommonForum = targetForumAssignments.some((a) =>
    approverForumIds.has(a.forumId)
  );

  if (!targetHasCommonForum) {
    return reply.code(403).send({
      error:
        "Forbidden: You can only approve heads for forums you are also a part of.",
    });
  }

  // 6. If all checks pass, update the target user's status to 'approved'
  const [updatedUser] = await db
    .update(users)
    .set({ approvalStatus: "approved" })
    .where(eq(users.id, targetUserId))
    .returning();

  await db.insert(forum_heads).values({
    userId: targetUserId,
    forumId: approverForumAssignments[0].forumId,
    isVerified: true, // Assuming heads are verified upon approval
  });

  return updatedUser;
}

/**
 * Handles the POST /forums/heads/:userId/reject route.
 * Allows an approved forum head to reject another pending forum head
 * for a forum they have in common.
 */
export async function rejectForumHead(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // 1. Get the rejecter's details from their JWT and the target user's ID from the URL
  const { id: rejecterId, role: rejecterRole } = request.user;
  const { userId: targetUserId } = request.params as { userId: string };

  // 2. Authorization: Ensure the user is a Forum Head
  if (rejecterRole !== "forum_head") {
    return reply
      .code(403)
      .send({ error: "Forbidden: Only forum heads can reject users." });
  }

  // 3. Fetch the rejecter's and target user's full profiles and their forum assignments
  const [
    rejecter,
    targetUser,
    rejecterForumAssignments,
    targetForumAssignments,
  ] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, rejecterId) }),
    db.query.users.findFirst({ where: eq(users.id, targetUserId) }),
    db.query.forum_heads.findMany({
      where: eq(forum_heads.userId, rejecterId),
    }),
    db.query.forum_heads.findMany({
      where: eq(forum_heads.userId, targetUserId),
    }),
  ]);

  // 4. Validation Checks
  if (!rejecter || !targetUser) {
    return reply.code(404).send({ error: "User not found." });
  }
  if (rejecter.approvalStatus !== "approved") {
    return reply
      .code(403)
      .send({ error: "Forbidden: Your own account is not yet approved." });
  }
  if (
    targetUser.approvalStatus !== "pending" ||
    targetUser.role !== "forum_head"
  ) {
    return reply
      .code(400)
      .send({ error: "This user is not a pending forum head." });
  }
  if (rejecter.collegeId !== targetUser.collegeId) {
    return reply
      .code(403)
      .send({ error: "Forbidden: Cannot reject users outside your college." });
  }

  // 5. CRITICAL SECURITY CHECK: Find if they share at least one common forum
  const rejecterForumIds = new Set(
    rejecterForumAssignments.map((a) => a.forumId)
  );
  const targetHasCommonForum = targetForumAssignments.some((a) =>
    rejecterForumIds.has(a.forumId)
  );

  if (!targetHasCommonForum) {
    return reply.code(403).send({
      error:
        "Forbidden: You can only reject heads for forums you are also a part of.",
    });
  }

  // 6. If all checks pass, update the target user's status to 'rejected'
  const [updatedUser] = await db
    .update(users)
    .set({ approvalStatus: "rejected" })
    .where(eq(users.id, targetUserId))
    .returning();

  // 7. Optionally, remove the rejected user from the forum_heads table
  await db.delete(forum_heads).where(eq(forum_heads.userId, targetUserId));

  return updatedUser;
}

/**
 * Handles the POST /events/:eventId/staff route.
 * A Forum Head requests a Teacher for an event, with a conflict check.
 */
export async function requestStaffForEvent(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // 1. Get user details, event ID, and the staff details to be requested
  const { collegeId } = request.user;
  const { eventId } = request.params as { eventId: string };
  const { userId: teacherUserId, assignmentRole } = request.body as {
    userId: string;
    assignmentRole?: string;
  };

  if (!teacherUserId) {
    return reply
      .code(400)
      .send({ error: "User ID of the teacher is required." });
  }

  // 3. Use a transaction to ensure all checks and inserts are atomic
  try {
    await db.transaction(async (tx) => {
      // Step A: Fetch the event and the teacher to be requested
      const [event, teacherUser] = await Promise.all([
        tx.query.events.findFirst({ where: eq(events.id, eventId) }),
        tx.query.users.findFirst({ where: eq(users.id, teacherUserId) }),
      ]);

      // Step B: Validation Checks
      if (!event) throw new Error("Event not found.");
      if (!teacherUser) throw new Error("Teacher not found.");
      if (
        event.collegeId !== collegeId ||
        teacherUser.collegeId !== collegeId
      ) {
        throw new Error(
          "Forbidden: Event and teacher must be within your college."
        );
      }
      if (teacherUser.role !== "teacher") {
        throw new Error("You can only request teachers to be event staff.");
      }

      // --- START OF FIX ---
      // Step C: Check if this teacher has already been requested for THIS event
      const existingAssignment = await tx.query.eventStaffAssignments.findFirst({
        where: and(
          eq(eventStaffAssignments.eventId, eventId),
          eq(eventStaffAssignments.userId, teacherUserId)
        )
      });

      if (existingAssignment) {
        throw new Error("This teacher has already been requested for this event.");
      }
      // --- END OF FIX ---


      // Step D: Find all of the teacher's *approved* assignments to check for time conflicts
      const teacherApprovedAssignments =
        await tx.query.eventStaffAssignments.findMany({
          where: and(
            eq(eventStaffAssignments.userId, teacherUserId),
            eq(eventStaffAssignments.status, "approved")
          ),
          with: { event: true },
        });

      // Step E: Check if the new event's time conflicts with any existing commitments
      for (const assignment of teacherApprovedAssignments) {
        const existingEvent = assignment.event as {
          name: string;
          startTime: Date;
          endTime: Date;
        };
        const newEventStart = event.startTime;
        const newEventEnd = event.endTime;

        const isOverlapping =
          newEventStart < existingEvent.endTime &&
          newEventEnd > existingEvent.startTime;

        if (isOverlapping) {
          throw new Error(
            `This teacher is already assigned to another event ('${existingEvent.name}') at this time.`
          );
        }
      }

      // Step F: Create the 'pending' assignment in the join table
      // REMOVED .onConflictDoNothing()
      await tx
        .insert(eventStaffAssignments)
        .values({
          eventId,
          userId: teacherUserId,
          assignmentRole: assignmentRole || "Staff in Charge",
          status: "pending",
        });
    });

    return { message: "Request has been sent to the teacher successfully." };
  } catch (error: any) {
    // Catch specific, known errors to provide clear feedback
    if (error.message.includes("already assigned") || error.message.includes("already been requested")) {
      return reply.code(409).send({ error: error.message }); // 409 Conflict
    }
    if (
      error.message.includes("not found") ||
      error.message.includes("Forbidden") ||
      error.message.includes("only request teachers")
    ) {
      return reply.code(400).send({ error: error.message });
    }
    // Catch any other unexpected errors
    console.error("Error requesting staff:", error);
    return reply.code(500).send({ error: "An unexpected error occurred." });
  }
}

/**
 * Handles the DELETE /events/:eventId route.
 * Permanently deletes a specific event.
 * This route is accessible only by the event organizer or a 'college_admin'.
 */
export async function deleteEvent(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // 1. Get user details from JWT and eventId from URL
  const { id: userId, role, collegeId } = request.user;
  const { eventId } = request.params as { eventId: string };

  if (!collegeId) {
    return reply
      .code(403)
      .send({ error: "Forbidden: No college associated with this account." });
  }

  // 2. Fetch the existing event from the database
  const existingEvent = await db.query.events.findFirst({
    where: and(eq(events.id, eventId), eq(events.collegeId, collegeId)),
  });

  if (!existingEvent) {
    return reply.code(404).send({ error: "Event not found." });
  }

  // 3. Authorization: Check if the user is the organizer or a college admin
  if (existingEvent.organizerId !== userId && role !== "college_admin") {
    return reply.code(403).send({
      error: "Forbidden: You do not have permission to delete this event.",
    });
  }

  // 4. Perform the delete operation
  await db.delete(events).where(eq(events.id, eventId));

  return { message: "Event deleted successfully." };
}

/**
 * Handles the DELETE /events/:eventId/staff/:staffUserId route.
 * Removes a staff member's assignment from a specific event.
 * This route is accessible by the event organizer or a 'college_admin'.
 */
export async function removeStaffFromEvent(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // 1. Get user details from JWT and IDs from URL
  const { id: requesterId, role: requesterRole, collegeId } = request.user;
  const { eventId, staffUserId } = request.params as {
    eventId: string;
    staffUserId: string;
  };

  if (!collegeId) {
    return reply
      .code(403)
      .send({ error: "Forbidden: No college associated with this account." });
  }

  // 2. Fetch the existing event from the database
  const event = await db.query.events.findFirst({
    where: and(
      eq(events.id, eventId),
      eq(events.collegeId, collegeId) // Security check
    ),
  });

  if (!event) {
    return reply.code(404).send({ error: "Event not found." });
  }

  // 3. Authorization: Check if the user is the organizer or a college admin
  if (event.organizerId !== requesterId && requesterRole !== "college_admin") {
    return reply.code(403).send({
      error:
        "Forbidden: You do not have permission to modify staff for this event.",
    });
  }

  // 4. Perform the delete operation on the join table
  await db
    .delete(eventStaffAssignments)
    .where(
      and(
        eq(eventStaffAssignments.eventId, eventId),
        eq(eventStaffAssignments.userId, staffUserId)
      )
    );

  return { message: "Staff member successfully removed from the event." };
}

/**
 * Handles the GET /venues route for Forum Heads.
 * Fetches a list of all venues for the user's college.
 */
export async function getVenuesForForumHead(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { collegeId } = request.user;
  const { search } = request.query as { search?: string };

  if (!collegeId) {
    return reply.code(403).send({
      error: "Forbidden: No college associated with this account.",
    });
  }

  const conditions = [eq(venues.collegeId, collegeId)];
  if (search) {
    conditions.push(ilike(venues.name, `%${search}%`));
  }

  const collegeVenues = await db.query.venues.findMany({
    where: and(...conditions),
    orderBy: (venues, { asc }) => [asc(venues.name)],
  });

  return collegeVenues;
}

/**
 * [NEW] Handles the GET /users/teachers route for Forum Heads.
 * Fetches a list of all approved teachers in the user's college, with optional search.
 */
export async function getTeachersForForumHead(request: FastifyRequest, reply: FastifyReply) {
  const { collegeId } = request.user;
  const { search } = request.query as { search?: string };

  if (!collegeId) {
    return reply.code(403).send({
      error: "Forbidden: No college associated with this account.",
    });
  }

  // Define conditions for the query
  const conditions = [
    eq(users.collegeId, collegeId),
    eq(users.role, "teacher"),
    eq(users.approvalStatus, "approved"),
    ne(users.id, request.user.id), // Exclude the current user
  ];

  // Add search term to conditions if it exists
  if (search) {
    conditions.push(ilike(users.fullName, `%${search}%`));
  }

  // Execute the query
  const teachers = await db.query.users.findMany({
    where: and(...conditions),
    columns: {
      id: true,
      fullName: true,
      email: true,
    },
    orderBy: (users, { asc }) => [asc(users.fullName)],
  });

  return teachers;
}

