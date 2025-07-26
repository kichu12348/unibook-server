import fastify from "fastify";
import fastifyJwt from "@fastify/jwt";
import * as dotenv from "dotenv";
import { db } from "./db";

import userRoutes from "./routes/userRoutes";
import superAdminRoutes from "./routes/superAdminRoutes";
import collegeAdminRoutes from "./routes/collegeAdminRoutes";
import forumRoutes from "./routes/forumRoutes";

import { verifyCollegeAdmin, verifySuperAdmin,verifyForumHead } from "./middlewares/checkRole";
import { verifyToken } from "./middlewares/authMiddleware";


dotenv.config();

const app = fastify({});

app.register(fastifyJwt, {
  secret: process.env.JWT_SECRET || "default_secret",
});

app.get("/health", async (_, res) => {
  try {
    await db.execute("SELECT 1");
    return {
      status: "ok",
      message: "Database connected successfully",
    };
  } catch (error) {
    app.log.error(error);
    res.status(500);
    return { status: "error", message: "Database connection failed" };
  }
});

app.register(userRoutes, { prefix: "/api/v1/auth" });
app.register(superAdminRoutes, {
  prefix: "/api/v1/sa",
  onRequest: [verifyToken],
  preHandler: verifySuperAdmin,
});
app.register(collegeAdminRoutes, {
  prefix: "/api/v1/admin",
  onRequest: [verifyToken],
  preHandler: verifyCollegeAdmin,
});
app.register(forumRoutes, {
  prefix: "/api/v1/forums",
  onRequest: [verifyToken],
  preHandler: verifyForumHead,
});

// Start the server
const start = async () => {
  try {
    const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
    const host = process.env.HOST || "localhost";

    await app.listen({ port, host });
    console.log(`Server is running on http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
