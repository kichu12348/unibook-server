import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from 'drizzle-orm';

// ## Enums

export const userRoleEnum = pgEnum("user_role", [
  "college_admin",
  "forum_head",
  "teacher",
  "student",
]);
export const eventStatusEnum = pgEnum("event_status", [
  "draft",
  "pending_approval",
  "confirmed",
  "cancelled",
]);

export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
]);

// ## Tables

export const colleges = pgTable("colleges", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  domainName: text("domain_name").unique(),
  hasPaid: boolean("has_paid").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// college forums table
export const forums = pgTable("forums", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  collegeId: uuid("college_id")
    .notNull()
    .references(() => colleges.id, { onDelete: "cascade" }),
});

// Schema for the college user
export const users = pgTable(
  "users",
  {
    // Unique identifier for the user
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),

    //approval status for the user, especially for students and teachers
    approvalStatus: approvalStatusEnum("approval_status")
      .default("pending")
      .notNull(),
    isEmailVerified: boolean("is_email_verified").default(false).notNull(),
    emailVerificationToken: text("email_verification_token"),
    emailVerificationExpires: timestamp("email_verification_expires", {
      mode: "date",
    }),

    // Foreign key to the college table
    collegeId: uuid("college_id")
      .notNull()
      .references(() => colleges.id, { onDelete: "cascade" }),
  },
  (table) => [
    { uniqueEmailInCollege: unique().on(table.collegeId, table.email) },
  ]
);

export const venues = pgTable("venues", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull(),
  locationDetails: text("location_details"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  collegeId: uuid("college_id")
    .notNull()
    .references(() => colleges.id, { onDelete: "cascade" }),
});

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  status: eventStatusEnum("status").default("draft").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  bannerImage: text("banner_image"),
  resizeMode: text("resize_mode"),
  registrationLink: text("registration_link"),
  collegeId: uuid("college_id")
    .notNull()
    .references(() => colleges.id, { onDelete: "cascade" }),
  venueId: uuid("venue_id").references(() => venues.id, {
    onDelete: "set null",
  }),
  organizerId: uuid("organizer_id")
    .notNull()
    .references(() => users.id),
    forumId: uuid("forum_id")
      .notNull()
      .references(() => forums.id, { onDelete: "cascade" }),
});

export const eventStaffAssignments = pgTable(
  "event_staff_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentRole: text("assignment_role").default("staff in charge"),
    status: approvalStatusEnum("status")
      .default("pending"),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    {
      uniqueEventUser: unique().on(table.eventId, table.userId),
    },
  ]
);


// forum heads table
export const forum_heads = pgTable("forum_heads", {
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  forumId: uuid("forum_id")
    .notNull()
    .references(() => forums.id, { onDelete: "cascade" }),
    isVerified: boolean("is_verified").default(false).notNull(),
});

//shuper admins table
export const superAdmins = pgTable("super_admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});


// A College can have many Users, Forums, Venues, and Events
export const collegeRelations = relations(colleges, ({ many }) => ({
  users: many(users),
  forums: many(forums),
  venues: many(venues),
  events: many(events),
}));

// A User belongs to one College and can be an organizer, staff member, or forum head
export const userRelations = relations(users, ({ one, many }) => ({
  college: one(colleges, {
    fields: [users.collegeId],
    references: [colleges.id],
  }),
  organizedEvents: many(events),
  staffAssignments: many(eventStaffAssignments),
  forum_heads: many(forum_heads),
}));

// A Forum belongs to one College and has many Forum Heads
export const forumRelations = relations(forums, ({ one, many }) => ({
  college: one(colleges, {
    fields: [forums.collegeId],
    references: [colleges.id],
  }),
  forum_heads: many(forum_heads),
}));

// A Venue belongs to one College and can host many Events
export const venueRelations = relations(venues, ({ one, many }) => ({
  college: one(colleges, {
    fields: [venues.collegeId],
    references: [colleges.id],
  }),
  events: many(events),
}));

// An Event has one College, one Organizer (a User), one Venue, and many Staff members
export const eventRelations = relations(events, ({ one, many }) => ({
  college: one(colleges, {
    fields: [events.collegeId],
    references: [colleges.id],
  }),
  organizer: one(users, {
    fields: [events.organizerId],
    references: [users.id],
  }),
  forum: one(forums, {
    fields: [events.forumId],
    references: [forums.id],
  }),
  venue: one(venues, {
    fields: [events.venueId],
    references: [venues.id],
  }),
  staffAssignments: many(eventStaffAssignments),
}));

// The join table for Event Staff Assignments
export const eventStaffAssignmentsRelations = relations(eventStaffAssignments, ({ one }) => ({
  event: one(events, {
    fields: [eventStaffAssignments.eventId],
    references: [events.id],
  }),
  user: one(users, {
    fields: [eventStaffAssignments.userId],
    references: [users.id],
  }),
}));

// The join table for Forum Heads
export const forumHeadsRelations = relations(forum_heads, ({ one }) => ({
  user: one(users, {
    fields: [forum_heads.userId],
    references: [users.id],
  }),
  forum: one(forums, {
    fields: [forum_heads.forumId],
    references: [forums.id],
  }),
}));
