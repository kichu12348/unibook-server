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
    forumId: uuid("forum_id").references(() => forums.id, {
      onDelete: "set null",
    }),
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
  collegeId: uuid("college_id")
    .notNull()
    .references(() => colleges.id, { onDelete: "cascade" }),
  venueId: uuid("venue_id").references(() => venues.id, {
    onDelete: "set null",
  }),
  organizerId: uuid("organizer_id")
    .notNull()
    .references(() => users.id),
});

export const eventStaffAssignments = pgTable(
  "event_staff_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentRole: text("assignment_role"),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    {
      uniqueEventUser: unique().on(table.eventId, table.userId),
    },
  ]
);

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

// forum heads table
export const forum_heads = pgTable("forum_heads", {
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  forumId: uuid("forum_id")
    .notNull()
    .references(() => forums.id, { onDelete: "cascade" }),
});

//shuper admins table
export const superAdmins = pgTable("super_admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
