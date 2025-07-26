# UniBook Server

A college event management system built with Fastify and Drizzle ORM.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` with your actual database credentials.

3. **Set up the database:**
   
   Make sure you have PostgreSQL running and create a database.
   
   Generate migration files from your schema:
   ```bash
   npm run db:generate
   ```
   
   Apply migrations to your database:
   ```bash
   npm run db:migrate
   ```
   
   Alternatively, you can push schema changes directly (for development):
   ```bash
   npm run db:push
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

## Database Commands

- `npm run db:generate` - Generate migration files from schema changes
- `npm run db:migrate` - Apply pending migrations to the database
- `npm run db:push` - Push schema changes directly to the database (development only)
- `npm run db:studio` - Open Drizzle Studio (web-based database browser)

## Project Structure

```
src/
├── db/
│   ├── schema.ts    # Database schema definitions
│   └── index.ts     # Database connection and configuration
└── index.ts         # Main server file
```

## Database Schema

The application includes the following tables:
- `colleges` - College information
- `users` - User accounts (admins, teachers, students)
- `venues` - Event venues
- `events` - Event information
- `event_staff_assignments` - Staff assignments for events
- `forums` - College forums

## API Endpoints

- `GET /health` - Health check endpoint that tests database connectivity

## Development

The server uses `ts-node-dev` for hot reloading during development. Any changes to TypeScript files will automatically restart the server.
