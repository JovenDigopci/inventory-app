# Local Setup

## Prerequisites

- Node.js 22 or newer
- MySQL Community Server 8 or compatible MySQL database
- npm

## Install Dependencies

```powershell
npm install
```

## Configure Environment

Copy `.env.example` to `.env` and adjust the database credentials:

```text
PORT=3000
SESSION_SECRET=change-this-secret
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=inventory_root_password
DB_NAME=inventory_app
SEED_OWNER_EMAIL=mt.owner@gmail.com
SEED_OWNER_PASSWORD=changeme0
```

## Start Database With Docker

If local MySQL is not working, use the included Docker database:

```powershell
npm run db:up
```

Wait until the container is healthy, then run the migration and seed commands below.

## Create Database Tables

Start MySQL or the Docker database, then run:

```powershell
npm run migrate
npm run seed
```

The seed command creates:

```text
Email: mt.owner@gmail.com
Password: changeme0
```

Change this password before production use.

## Run the App

```powershell
npm start
```

Open:

```text
http://localhost:3000
```

## Development Mode

```powershell
npm run dev
```

## Verification

```powershell
npm test
```

## Notes

- This implementation uses HTML, CSS, and JavaScript for the frontend.
- The backend is Node.js with Express.
- The database schema is MySQL.
- Docker Compose can run the MySQL database with `npm run db:up`.
- Product pictures are uploaded to `src/public/uploads`.
