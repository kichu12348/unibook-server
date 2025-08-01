import { FastifyRequest, FastifyReply } from "fastify";
import { db } from "../db";
import { users, venues, forums, forum_heads } from "../db/schema";
import { and, ne, eq, inArray, ilike } from "drizzle-orm";

/**
 * Handles the GET /admin/users route.
 * Fetches a list of all users for the currently logged-in admin's college.
 * This route is accessible by a 'college_admin'.
 * It's the primary way for an admin to see pending approval requests.
 */
export async function getUsersForCollegeAdmin(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Get the admin's collegeId from their JWT payload
  const { collegeId, id } = request.user;

  if (!collegeId) {
    return reply.code(403).send({
      error: "Forbidden: No college associated with this admin account.",
    });
  }

  //Fetch all users belonging to that specific college
  const collegeUsers = await db.query.users.findMany({
    where: and(
      eq(users.collegeId, collegeId),
      ne(users.id, id),
      ne(users.role, "college_admin")
    ),
    columns: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      approvalStatus: true,
      isEmailVerified: true,
      createdAt: true,
    },
    with: {
      forum_heads: {
        columns: {
          forumId: true,
          isVerified: true,
        },
        with: {
          forum: {
            columns: {
              name: true,
            },
          },
        },
      },
    },
    orderBy: (users, { desc }) => [desc(users.createdAt)],
  });

  return collegeUsers;
}

/**
 * Handles the PUT /admin/users/:userId/approve route.
 * Approves a pending user (teacher or forum_head).
 * This route is accessible by 'college_admin' and 'forum_head'.
 */
export async function approveUser(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { id: approverId } = request.user;
  const { userId: targetUserId } = request.params as { userId: string };
  const { forumId } = request.body as { forumId?: string }; // Get forumId from body
  const [approver, targetUser] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, approverId) }),
    db.query.users.findFirst({ where: eq(users.id, targetUserId) }),
  ]);

  if (!approver || !targetUser) {
    return reply.code(404).send({ error: "User not found." });
  }

  if (approver.approvalStatus !== "approved") {
    return reply.code(403).send({ error: "Forbidden: Your own account is not approved." });
  }
  if (approver.collegeId !== targetUser.collegeId) {
    return reply.code(403).send({ error: "Forbidden: You can only approve users within your own college." });
  }

  // --- Role-specific Logic ---
  const [updatedUser] = await db
    .update(users)
    .set({ approvalStatus: "approved" })
    .where(eq(users.id, targetUserId))
    .returning({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      role: users.role,
      collegeId: users.collegeId,
      approvalStatus: users.approvalStatus,
      createdAt: users.createdAt,
    });

  if (updatedUser.role === "forum_head") {
    if (!forumId) {
      return reply.code(400).send({ error: "A forumId is required to approve a forum head." });
    }

    await db.delete(forum_heads).where(and(
      eq(forum_heads.userId, targetUserId),
      eq(forum_heads.isVerified, false)
    ));
    
    await db.insert(forum_heads).values({
      userId: targetUserId,
      forumId: forumId,
      isVerified: true,
    }).onConflictDoNothing();
  }

  return updatedUser;
}

/**
 * Handles the POST /admin/users/:userId/reject route.
 * Rejects a pending user (teacher or forum_head), changing their status to 'rejected'.
 * This route is accessible only by a 'college_admin'.
 */
export async function rejectUser(request: FastifyRequest, reply: FastifyReply) {
  const { collegeId: adminCollegeId } = request.user;
  const { userId: targetUserId } = request.params as { userId: string };

  const targetUser = await db.query.users.findFirst({ where: eq(users.id, targetUserId) });

  if (!targetUser) {
    return reply.code(404).send({ error: "User not found." });
  }
  if (targetUser.collegeId !== adminCollegeId) {
    return reply.code(403).send({ error: "Forbidden: You can only reject users within your own college." });
  }
  if (targetUser.approvalStatus === "approved") {
    return reply.code(400).send({ error: "Cannot reject a user who is already approved." });
  }
  if (targetUser.role !== "teacher" && targetUser.role !== "forum_head") {
    return reply.code(400).send({ error: "College admins can only reject teachers or forum heads." });
  }

  const [updatedUser] = await db
    .update(users)
    .set({ approvalStatus: "rejected" })
    .where(eq(users.id, targetUserId))
    .returning();
    
  // If a forum head is rejected, remove their pending entry from the join table.
  if (updatedUser.role === "forum_head") {
      await db.delete(forum_heads).where(and(
          eq(forum_heads.userId, targetUserId),
          eq(forum_heads.isVerified, false)
      ));
  }

  return updatedUser;
}

/**
 * Handles the DELETE /admin/users/:userId route.
 * Permanently deletes a user from the college.
 * This route is accessible only by a 'college_admin'.
 */
export async function deleteUser(request: FastifyRequest, reply: FastifyReply) {
  const {
    id: adminId,
    role: adminRole,
    collegeId: adminCollegeId,
  } = request.user;
  const { userId: targetUserId } = request.params as { userId: string };

  if (adminRole !== "college_admin") {
    return reply.code(403).send({
      error: "Forbidden: You do not have permission to perform this action.",
    });
  }

  if (adminId === targetUserId) {
    return reply
      .code(400)
      .send({ error: "You cannot delete your own account." });
  }

  const targetUser = await db.query.users.findFirst({
    where: eq(users.id, targetUserId),
  });

  if (!targetUser) {
    return reply.code(404).send({ error: "User not found." });
  }

  //CRITICAL SECURITY CHECK: Ensure the admin is deleting a user within their own college
  if (targetUser.collegeId !== adminCollegeId) {
    return reply.code(403).send({
      error: "Forbidden: You can only delete users within your own college.",
    });
  }

  await db.delete(users).where(eq(users.id, targetUserId));

  return { message: "User deleted successfully." };
}

/**
 * Handles the POST /venues route.
 * Creates a new venue for the college.
 * This route is accessible only by a 'college_admin'.
 */
export async function createVenue(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { role: adminRole, collegeId: adminCollegeId } = request.user;
  if (adminRole !== "college_admin") {
    return reply.code(403).send({
      error: "Forbidden: You do not have permission to create venues.",
    });
  }

  const { name, capacity, locationDetails } = request.body as {
    name: string;
    capacity: number;
    locationDetails?: string;
  };

  if (!name || !capacity) {
    return reply
      .code(400)
      .send({ error: "Venue name and capacity are required." });
  }

  if (!adminCollegeId) {
    return reply.code(403).send({
      error: "Forbidden: No college associated with this admin account.",
    });
  }

  const [newVenue] = await db
    .insert(venues)
    .values({
      name,
      capacity,
      locationDetails: locationDetails || null,
      collegeId: adminCollegeId,
    })
    .returning();

  return reply.code(201).send(newVenue);
}

/**
 * Handles the POST /forums route.
 * Creates a new forum for the college and can optionally assign multiple initial heads.
 * This route is accessible only by a 'college_admin'.
 */
export async function createForum(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { role: adminRole, collegeId: adminCollegeId } = request.user;
  if (adminRole !== "college_admin") {
    return reply.code(403).send({
      error: "Forbidden: You do not have permission to create forums.",
    });
  }
  const { name, description, headIds } = request.body as {
    name: string;
    description?: string;
    headIds?: string[];
  };

  if (!name) {
    return reply.code(400).send({ error: "Forum name is required." });
  }
  if (!adminCollegeId) {
    return reply.code(403).send({
      error: "Forbidden: No college associated with this admin account.",
    });
  }

  const newForum = await db.transaction(async (tx) => {
    const [createdForum] = await tx
      .insert(forums)
      .values({
        name,
        description,
        collegeId: adminCollegeId,
      })
      .returning();
    if (headIds && headIds.length > 0) {
      const potentialHeads = await tx.query.users.findMany({
        where: inArray(users.id, headIds),
      });

      if (potentialHeads.length !== headIds.length) {
        throw new Error(
          "One or more provided user IDs for forum heads are invalid."
        );
      }

      for (const head of potentialHeads) {
        if (head.collegeId !== adminCollegeId) {
          throw new Error(`User ${head.fullName} is not in the same college.`);
        }
        if (head.role === "college_admin") {
          throw new Error(
            `User ${head.fullName} is already an admin and cannot be a forum head.`
          );
        }
      }
      await tx
        .update(users)
        .set({ role: "forum_head" })
        .where(inArray(users.id, headIds));

      const headsToInsert = headIds.map((userId) => ({
        userId: userId,
        forumId: createdForum.id,
        isVerified: true, // Assuming heads are verified upon creation
      }));

      await tx.insert(forum_heads).values(headsToInsert);
    }
    return createdForum;
  });

  return reply.code(201).send(newForum);
}

/*
 *handles the PUT /forums/:forumId/update route.
 *Updates the details of an existing forum.
 *This route is accessible only by a 'college_admin'.
 */

export async function updateForum(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { role: adminRole, collegeId: adminCollegeId } = request.user;
  if (adminRole !== "college_admin") {
    return reply.code(403).send({
      error: "Forbidden: You do not have permission to update forums.",
    });
  }

  const { forumId } = request.params as { forumId: string };
  const { name, description } = request.body as {
    name?: string;
    description?: string;
  };

  if (!forumId) {
    return reply.code(400).send({ error: "Forum ID is required." });
  }

  const [updatedForum] = await db
    .update(forums)
    .set({
      name,
      description,
    })
    .where(eq(forums.id, forumId))
    .returning();

  return reply.code(200).send(updatedForum);
}

/**
 * Handles the GET /forums route.
 * Fetches a list of all forums for the user's college, including the
 * details of the users who are heads of each forum.
 * This route is accessible by any authenticated user within a college.
 */
export async function getForums(request: FastifyRequest, reply: FastifyReply) {
  const { collegeId } = request.user;

  if (!collegeId) {
    return reply
      .code(403)
      .send({ error: "Forbidden: No college associated with this account." });
  }

  const collegeForums = await db.query.forums.findMany({
    where: eq(forums.collegeId, collegeId),
    columns: {
      id: true,
      name: true,
      description: true,
    },
    orderBy: (forums, { asc }) => [asc(forums.name)],
  });
  // Format the response to be more ooser-friendly
  const formattedForums = collegeForums.map((forum) => ({
    id: forum.id,
    name: forum.name,
    description: forum.description,
  }));

  return formattedForums;
}

export async function getForumById(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { forumId } = request.params as { forumId: string };
  const { collegeId } = request.user;

  if (!collegeId) {
    return reply.code(403).send({
      error: "Forbidden: No college associated with this account.",
    });
  }

  const forum = await db.query.forums.findFirst({
    where: and(eq(forums.id, forumId), eq(forums.collegeId, collegeId)),
    with: {
      forum_heads: {
        with: {
          user: {
            columns: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!forum) {
    return reply.code(404).send({ error: "Forum not found." });
  }

  return {
    id: forum.id,
    name: forum.name,
    description: forum.description,
    createdAt: forum.createdAt,
    heads: (forum.forum_heads as { user: { id: string; fullName: string } }[])
      .map((fh) => fh.user)
      .filter(Boolean),
  };
}

export async function searchUsersForCollegeAdmin(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // 1. Get the search query from the request URL (e.g., /users?search=John)
  const { search } = request.query as { search?: string };

  const { collegeId, id } = request.user;
  if (!collegeId) {
    return reply.code(403).send({
      error: "Forbidden: No college associated with this admin account.",
    });
  }

  // 2. Build the query conditions dynamically
  const conditions = [
    eq(users.collegeId, collegeId),
    ne(users.id, id),
    ne(users.role, "college_admin"),
    eq(users.approvalStatus, "approved"),
    eq(users.role, "student"), // Only search for students
  ];

  // 3. If a search term is provided, add the 'ilike' condition
  if (search) {
    conditions.push(ilike(users.fullName, `%${search}%`));
  }

  // Fetch users using the combined conditions
  const collegeUsers = await db.query.users.findMany({
    where: and(...conditions), // Use the spread operator to apply all conditions
    columns: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      approvalStatus: true,
      isEmailVerified: true,
      createdAt: true,
    },
    orderBy: (users, { desc }) => [desc(users.createdAt)],
  });

  return collegeUsers;
}

/**
 * Handles the GET /admin/venues route.
 * Fetches a list of all venues for the currently logged-in admin's college.
 * Accepts an optional 'search' query parameter to filter by name.
 */
export async function getVenues(request: FastifyRequest, reply: FastifyReply) {
  const { collegeId } = request.user;
  const { search } = request.query as { search?: string }; 

  if (!collegeId) {
    return reply.code(403).send({
      error: "Forbidden: No college associated with this admin account.",
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
 * Handles the GET /admin/venues/:venueId route.
 * Fetches details for a single venue.
 */
export async function getVenueById(request: FastifyRequest, reply: FastifyReply) {
  const { collegeId } = request.user;
  const { venueId } = request.params as { venueId: string };

  if (!collegeId) {
    return reply.code(403).send({
      error: "Forbidden: No college associated with this admin account.",
    });
  }

  const venue = await db.query.venues.findFirst({
    where: and(eq(venues.id, venueId), eq(venues.collegeId, collegeId)),
  });

  if (!venue) {
    return reply.code(404).send({ error: 'Venue not found.' });
  }

  return venue;
}

/**
 * Handles the PUT /admin/venues/:venueId/update route.
 * Updates an existing venue.
 */
export async function updateVenue(request: FastifyRequest, reply: FastifyReply) {
  const { collegeId } = request.user;
  const { venueId } = request.params as { venueId: string };
  const { name, capacity, locationDetails } = request.body as { name?: string; capacity?: number; locationDetails?: string };

  if (!collegeId) {
    return reply.code(403).send({
      error: "Forbidden: No college associated with this admin account.",
    });
  }

  // First, verify the venue belongs to the admin's college
  const existingVenue = await db.query.venues.findFirst({
    where: and(eq(venues.id, venueId), eq(venues.collegeId, collegeId)),
  });

  if (!existingVenue) {
    return reply.code(404).send({ error: "Venue not found or you don't have permission to edit it." });
  }

  const [updatedVenue] = await db
    .update(venues)
    .set({
      name,
      capacity,
      locationDetails,
    })
    .where(eq(venues.id, venueId))
    .returning();

  return reply.code(200).send(updatedVenue);
}

/**
 * Handles the DELETE /admin/forums/:forumId route.
 * Permanently deletes a forum from the college.
 */
export async function deleteForum(request: FastifyRequest, reply: FastifyReply) {
  const { collegeId: adminCollegeId } = request.user;
  const { forumId } = request.params as { forumId: string };

  if (!adminCollegeId) {
    return reply.code(403).send({
      error: "Forbidden: No college associated with this admin account.",
    });
  }
  // Verify the forum exists and belongs to the admin's college before deleting
  const forumToDelete = await db.query.forums.findFirst({
    where: and(eq(forums.id, forumId), eq(forums.collegeId, adminCollegeId)),
    columns: { id: true },
  });

  if (!forumToDelete) {
    return reply.code(404).send({ error: "Forum not found or you don't have permission to delete it." });
  }

  await db.delete(forums).where(eq(forums.id, forumId));

  return { message: "Forum deleted successfully." };
}

/**
 * Handles the DELETE /admin/venues/:venueId route.
 * Permanently deletes a venue from the college.
 */
export async function deleteVenue(request: FastifyRequest, reply: FastifyReply) {
  const { collegeId: adminCollegeId } = request.user;
  const { venueId } = request.params as { venueId: string };

  if (!adminCollegeId) {
    return reply.code(403).send({
      error: "Forbidden: No college associated with this admin account.",
    });
  }

  const venueToDelete = await db.query.venues.findFirst({
    where: and(eq(venues.id, venueId), eq(venues.collegeId, adminCollegeId)),
    columns: { id: true },
  });

  if (!venueToDelete) {
    return reply.code(404).send({ error: "Venue not found or you don't have permission to delete it." });
  }

  await db.delete(venues).where(eq(venues.id, venueId));

  return { message: "Venue deleted successfully." };
}