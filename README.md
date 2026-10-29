# Viora – Real-Time Communication App

Viora is a real-time communication and collaboration platform that enables users to connect through video meetings, share screens, exchange messages and files, and collaborate using a shared whiteboard. It is designed to provide a smooth and organized online meeting experience.

## Features

- **User Authentication:** Register and log in securely.
- **Instant Meetings:** Create a meeting room and invite participants using a meeting code.
- **Meeting Scheduling:** Schedule meetings by selecting a meeting name, date, and start time.
- **Meeting History:** View recent meetings, including scheduled, active, and completed meetings.
- **Meeting Expiration:** Configure how long a meeting remains available.
- **Video Calling:** Communicate with participants using WebRTC.
- **Camera and Microphone Controls:** Turn your camera and microphone on or off.
- **Screen Sharing:** Present your screen during a meeting.
- **Real-Time Chat:** Exchange messages with other participants.
- **File Sharing:** Upload and download files within a meeting.
- **Collaborative Whiteboard:** Draw and collaborate in real time.
- **Participant Management:** View participants and handle joining and leaving.
- **Meeting Controls:** Leave a meeting or end it for everyone when authorized.
- **Responsive Interface:** A modern dark-themed interface designed for different screen sizes.
- **PostgreSQL Database:** Store user and meeting information.

## Technology Stack

### Frontend
- React
- TypeScript
- Vite
- CSS
- Socket.IO Client
- WebRTC
- Lucide React

### Backend
- Node.js
- Express.js
- Socket.IO
- Prisma ORM
- PostgreSQL
- JSON Web Tokens (JWT)
- Zod
- Multer

## Project Structure

```text
CodeAlpha_Communcation_app/
├── frontend/
│   ├── src/
│   │   ├── Dashboard.tsx
│   │   ├── Dashboard.css
│   │   ├── MeetingRoom.tsx
│   │   ├── MeetingRoom.css
│   │   └── meetingApi.ts
│   ├── package.json
│   └── vite.config.ts
│
├── backend/
│   ├── middleware/
│   ├── routes/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── uploads/
│   ├── server.js
│   └── package.json
│
├── .gitignore
└── README.md
```

*Note: The exact file structure may differ depending on your current project setup.*

## Prerequisites

Install the following before running Viora:

- Node.js and npm
- PostgreSQL
- Git (optional, for command-line version control)
- GitHub Desktop (optional, for managing the repository)

## Installation and Setup

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/CodeAlpha_Communcation_app.git
cd CodeAlpha_Communcation_app
```

Replace `YOUR_USERNAME` with your GitHub username.

### 2. Set Up the Database

Create a PostgreSQL database named:

```sql
CREATE DATABASE viora_db;
```

Make sure PostgreSQL is running before starting the backend.

### 3. Configure the Backend

Open a terminal in the backend directory:

```bash
cd backend
npm install
```

Create a `.env` file in the backend directory and configure the required environment variables:

```env
PORT=5000
DATABASE_URL="postgresql://YOUR_DB_USER:YOUR_DB_PASSWORD@localhost:5432/viora_db"
JWT_SECRET="REPLACE_WITH_A_LONG_RANDOM_SECRET"
```

Replace the placeholders with your local PostgreSQL credentials and a secure random JWT secret. Never commit this file to GitHub.

### 4. Configure Prisma

Run the following commands from the backend directory:

```bash
npx prisma generate
npx prisma migrate deploy
```

For a development database where you need to create a new migration after changing the schema, use:

```bash
npx prisma migrate dev --name your_migration_name
```

Use the migration command appropriate to the migrations included in the repository.

### 5. Start the Backend

From the backend directory, run the command matching your `package.json` scripts. For example:

```bash
npm run dev
```

If no development script exists, use the configured server entry point:

```bash
node server.js
```

The backend is expected to run at:

```text
http://localhost:5000
```

### 6. Set Up the Frontend

Open a separate terminal:

```bash
cd frontend
npm install
```

Start the Vite development server:

```bash
npm run dev
```

Open the local URL displayed in the terminal, usually:

```text
http://localhost:5173
```

## How to Use Viora

1. Register a new account or log in.
2. Create an instant meeting or schedule one for a future date and time.
3. Share the meeting code with the people you want to invite.
4. Join a meeting using a valid meeting code.
5. Enable your camera and microphone as required.
6. Share your screen, send chat messages, upload files, or use the collaborative whiteboard.
7. Leave the meeting when finished, or end it for everyone if you are the authorized host.
8. View scheduled and completed meetings in the dashboard.

Meeting access depends on the meeting status, scheduling time, and configured expiration rules.

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Backend server port |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret used to sign and verify authentication tokens |

Keep credentials and secrets in your local `.env` file. Use a `.env.example` file with placeholder values if you want to document the required configuration.


