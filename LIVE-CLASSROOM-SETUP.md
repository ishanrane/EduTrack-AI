# EduTrack AI – Live Classroom Setup

This update adds a multi-user live classroom using LiveKit (WebRTC), a synchronized collaborative whiteboard, participant list, chat, camera/microphone controls, and screen sharing.

## 1. Create a LiveKit project
1. Create a project at https://cloud.livekit.io/ (or run your own LiveKit server).
2. Copy the WebSocket URL, API key, and API secret from the project settings.
3. Do not put the API secret in the React `.env` file.

## 2. Frontend
From the project root:

```bash
npm install
npm install livekit-client
```

Create `.env` based on `.env.example`:

```env
VITE_API_URL=http://localhost:8000
VITE_LIVEKIT_URL=wss://YOUR-PROJECT.livekit.cloud
```

Restart Vite after changing `.env`:

```bash
npm run dev
```

## 3. Backend
Activate the Python virtual environment, then:

```bash
pip install -r backend/requirements.txt
```

Set backend environment variables (PowerShell example):

```powershell
$env:LIVEKIT_API_KEY="your_api_key"
$env:LIVEKIT_API_SECRET="your_api_secret"
```

Start FastAPI from the project root:

```bash
uvicorn backend.server:app --reload --host 0.0.0.0 --port 8000
```

## 4. How to test with multiple people
- Open the student portal in two separate browsers/devices and join the same lecture.
- Use the same room/classroom name on both devices. Both users should appear in the video grid and participant list.
- Try mic, camera, screen share, chat, and draw on the whiteboard. Whiteboard strokes and chat messages are broadcast to everyone in the room.
- For testing on another device, expose the frontend and backend over your LAN or deploy them; `localhost` on another device points to that device, not your PC.

## Notes
- LiveKit Cloud or a correctly configured self-hosted LiveKit server is required for real multi-user media. The browser cannot connect users together by itself.
- Camera and microphone require HTTPS in production (localhost is allowed for development).
- Whiteboard collaboration currently broadcasts strokes and clear events in real time; persistence, board pages, permissions/teacher moderation, and recording can be added later.
- Demo lecture records are local frontend data. Use the exact same room name for the teacher and students until classroom scheduling is connected to a shared backend database.
