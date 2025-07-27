import { FastifyRequest, FastifyReply } from "fastify";
import { db } from "../db";
import { events, forums, colleges } from "../db/schema";
import { and, eq, gte } from "drizzle-orm";

/**
 * Handles the GET /events route.
 * Fetches a list of all upcoming events for the authenticated user's college.
 * This route is accessible by any authenticated user.
 */
export async function getPublicEvents(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // 1. Get the user's collegeId from their JWT payload.
  // This ensures users only see events from their own college.
  const { collegeId } = request.user;

  if (!collegeId) {
    return reply
      .code(403)
      .send({ error: "Forbidden: No college associated with this account." });
  }

  // 2. Fetch all events for the college that have not yet ended.
  const upcomingEvents = await db.query.events.findMany({
    where: and(
      eq(events.collegeId, collegeId),
      gte(events.endTime, new Date()) // Filter for events that are not over yet
    ),
    with: {
      // Include relevant details from related tables
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
    orderBy: (events, { asc }) => [asc(events.startTime)], // Show the soonest events first
  });

  return upcomingEvents;
}

/**
 * Handles the GET /events/:eventId route.
 * Fetches the full details of a single event, accessible by any authenticated
 * user within the same college.
 */
export async function getPublicEventById(
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

  // 2. Fetch the specific event, ensuring it belongs to the user's college
  const eventDetails = await db.query.events.findFirst({
    where: and(
      eq(events.id, eventId),
      eq(events.collegeId, collegeId) // Security check
    ),
    with: {
      // Include all relevant details for the event view
      venue: {
        columns: {
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

  // 3. Format the response for a cleaner, more client-friendly output
  const formattedEvent = {
    ...eventDetails,
    // Map the nested staff assignments to a simple array of staff members
    staff: (eventDetails.staffAssignments as any[]).map((assignment) => ({
      ...assignment.user,
      assignmentRole: assignment.assignmentRole,
    })),
  };
  // Remove the original nested structure to avoid redundancy
  delete (formattedEvent as any).staffAssignments;

  return formattedEvent;
}

/**
 * Handles the GET /forums route.
 * Fetches a list of all forums for the authenticated user's college,
 * including the details of the users who are heads of each forum.
 */
export async function getPublicForums(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // 1. Get the user's collegeId from their JWT payload
  const { collegeId } = request.user;

  if (!collegeId) {
    return reply
      .code(403)
      .send({ error: "Forbidden: No college associated with this account." });
  }

  // 2. Fetch all forums for the college using a relational query
  const collegeForums = await db.query.forums.findMany({
    where: eq(forums.collegeId, collegeId),
    with: {
      // Include the list of forum heads via the join table
      forum_heads: {
        with: {
          // For each head, include their user details
          user: {
            columns: {
              id: true,
              fullName: true,
            },
          },
        },
      },
    },
    orderBy: (forums, { asc }) => [asc(forums.name)],
  });

  // 3. Format the response to be more client-friendly
  const formattedForums = collegeForums.map((forum) => ({
    id: forum.id,
    name: forum.name,
    description: forum.description,
    createdAt: forum.createdAt,
    // Map the nested structure to a simple array of head users
    heads: (forum.forum_heads as any[]).map((fh) => fh.user),
  }));

  return formattedForums;
}

/**
 * Handles the GET /forums/:forumId route.
 * Fetches the full details of a single forum, including its heads and a list of events it has organized.
 * This route is accessible by any authenticated user within the same college.
 * NOTE: This requires a 'forumId' field on the 'events' table.
 */
export async function getForumById(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // 1. Get the user's collegeId from their JWT and the forumId from the URL
  const { collegeId } = request.user;
  const { forumId } = request.params as { forumId: string };

  if (!collegeId) {
    return reply
      .code(403)
      .send({ error: "Forbidden: No college associated with this account." });
  }

  // 2. Fetch the specific forum, ensuring it belongs to the user's college
  const forumDetails = await db.query.forums.findFirst({
    where: and(
      eq(forums.id, forumId),
      eq(forums.collegeId, collegeId) // Security check
    ),
    with: {
      // Include the list of forum heads
      forum_heads: {
        with: {
          user: {
            columns: {
              id: true,
              fullName: true,
            },
          },
        },
      },
      // Include the list of events organized by this forum
      events: {
        orderBy: (
          events: { startTime: Date },
          { desc }: { desc: (field: Date) => any }
        ) => [desc(events.startTime)],
        with: {
          venue: {
            columns: { name: true },
          },
        },
      },
    },
  });

  if (!forumDetails) {
    return reply.code(404).send({ error: "Forum not found." });
  }

  // 3. Format the response for a cleaner output
  const formattedForum = {
    id: forumDetails.id,
    name: forumDetails.name,
    description: forumDetails.description,
    createdAt: forumDetails.createdAt,
    // Map the nested structures to simple arrays
    heads: (forumDetails.forum_heads as any[]).map((fh) => fh.user),
    events: (forumDetails.events as any[]).map((event) => ({
      id: event.id,
      name: event.name,
      startTime: event.startTime,
      venueName: event.venue?.name || null,
    })),
  };

  return formattedForum;
}

/**
 * Handles the GET /colleges/me route.
 * Fetches the details of the currently authenticated user's college.
 * This route is accessible by any authenticated user.
 */
export async function getMyCollegeDetails(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // 1. Get the user's collegeId from their JWT payload
  const { collegeId } = request.user;

  if (!collegeId) {
    return reply
      .code(403)
      .send({ error: "Forbidden: No college associated with this account." });
  }

  // 2. Fetch the college details from the database
  const collegeDetails = await db.query.colleges.findFirst({
    where: eq(colleges.id, collegeId),
  });

  if (!collegeDetails) {
    return reply.code(404).send({ error: "College not found." });
  }

  // 3. Return the college details
  return collegeDetails;
}
