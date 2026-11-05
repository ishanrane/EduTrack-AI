import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, ParticipantEvent, Track, createLocalTracks, createLocalScreenTracks } from "livekit-client";
import "./ClassroomPage.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL || "";

export default function ClassroomPage({ lecture, studentEmail, role = "Student", onBack }) {
  const [room, setRoom] = useState(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [participants, setParticipants] = useState([]);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [screenOn, setScreenOn] = useState(false);
  const [chat, setChat] = useState([]);
  const [chatText, setChatText] = useState("");
  const [tab, setTab] = useState("chat");
  const [whiteboardEnabled, setWhiteboardEnabled] = useState(true);
  const [penColor, setPenColor] = useState("#25223a");
  const [penSize, setPenSize] = useState(4);
  const [isDrawing, setIsDrawing] = useState(false);
  const videoRefs = useRef(new Map());
  const canvasRef = useRef(null);
  const previousPoint = useRef(null);
  const screenTrackRef = useRef(null);
  const isTeacher = role === "Teacher" || role === "Admin";
  const roomName = String(lecture.room_id || lecture.room || lecture.classroom || lecture.sub || "edutrack-classroom").toLowerCase().replace(/[^a-z0-9-]+/g, "-");

  const refreshParticipants = useCallback((activeRoom) => {
    if (!activeRoom) return;
    const all = [activeRoom.localParticipant, ...activeRoom.remoteParticipants.values()];
    setParticipants(all.map((p) => ({ identity: p.identity, name: p.name || p.identity, isLocal: p === activeRoom.localParticipant, mic: p.isMicrophoneEnabled, camera: p.isCameraEnabled })));
  }, []);

  const attachVideo = useCallback((element, participant) => {
    if (!element || !participant) return;
    const publication = participant.getTrackPublication(Track.Source.Camera);
    if (publication?.track) publication.track.attach(element);
    return () => publication?.track?.detach(element);
  }, []);

  useEffect(() => {
    if (!room) return undefined;
    const sync = () => refreshParticipants(room);
    room.on(RoomEvent.ParticipantConnected, sync);
    room.on(RoomEvent.ParticipantDisconnected, sync);
    room.on(RoomEvent.TrackPublished, sync);
    room.on(RoomEvent.TrackUnpublished, sync);
    room.on(RoomEvent.TrackSubscribed, sync);
    room.on(RoomEvent.TrackUnsubscribed, sync);
    room.on(RoomEvent.DataReceived, (payload, participant) => {
      try {
        const message = JSON.parse(new TextDecoder().decode(payload));
        if (message.type === "chat") setChat((old) => [...old, { ...message, sender: participant?.name || participant?.identity || "Participant", mine: false }]);
        if (message.type === "board") drawRemote(message);
        if (message.type === "board-clear") clearCanvas(false);
      } catch { /* ignore non-app data */ }
    });
    refreshParticipants(room);
    return () => {
      room.removeAllListeners();
    };
  }, [room, refreshParticipants]);

  useEffect(() => () => {
    if (room) room.disconnect();
    screenTrackRef.current?.stop();
  }, [room]);

  async function joinRoom() {
    setConnecting(true); setError("");
    try {
      if (!LIVEKIT_URL) throw new Error("LiveKit URL missing. Set VITE_LIVEKIT_URL in frontend .env.");
      const identity = studentEmail || `guest-${Date.now()}@edutrack.ai`;
      const response = await fetch(`${API}/classroom/token`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: roomName, identity, name: identity.split("@")[0], role })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not create classroom access token.");
      const nextRoom = new Room({ adaptiveStream: true, dynacast: true });
      await nextRoom.connect(LIVEKIT_URL, data.token);
      setRoom(nextRoom); setConnected(true);
      const tracks = await createLocalTracks({ audio: true, video: true });
      for (const track of tracks) await nextRoom.localParticipant.publishTrack(track);
      refreshParticipants(nextRoom);
    } catch (err) {
      setError(err.message || "Unable to join. Check camera/microphone permission and server settings.");
    } finally { setConnecting(false); }
  }

  async function toggleMic() {
    if (!room) return;
    const next = !micOn; await room.localParticipant.setMicrophoneEnabled(next); setMicOn(next); refreshParticipants(room);
  }
  async function toggleCamera() {
    if (!room) return;
    const next = !cameraOn; await room.localParticipant.setCameraEnabled(next); setCameraOn(next); refreshParticipants(room);
  }
  async function toggleScreen() {
    if (!room) return;
    try {
      if (screenOn && screenTrackRef.current) {
        await room.localParticipant.unpublishTrack(screenTrackRef.current);
        screenTrackRef.current.stop(); screenTrackRef.current = null; setScreenOn(false); return;
      }
      const tracks = await createLocalScreenTracks({ audio: false });
      const screen = tracks[0]; screenTrackRef.current = screen;
      screen.mediaStreamTrack.addEventListener("ended", () => { screenTrackRef.current = null; setScreenOn(false); });
      await room.localParticipant.publishTrack(screen); setScreenOn(true);
    } catch (err) { setError(err.message || "Screen sharing was cancelled or unavailable."); }
  }
  async function leaveRoom() {
    if (room) await room.disconnect();
    setRoom(null); setConnected(false); setParticipants([]); onBack?.();
  }
  async function sendData(payload) {
    if (!room) return;
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    await room.localParticipant.publishData(bytes, { reliable: true });
  }
  async function sendChat(event) {
    event.preventDefault();
    const text = chatText.trim(); if (!text || !room) return;
    const message = { type: "chat", text, sender: studentEmail, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
    await sendData(message); setChat((old) => [...old, { ...message, sender: "You", mine: true }]); setChatText("");
  }
  function canvasPoint(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  }
  function paintSegment(ctx, from, to, color, size) {
    ctx.strokeStyle = color; ctx.lineWidth = size; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(from.x * ctx.canvas.width, from.y * ctx.canvas.height); ctx.lineTo(to.x * ctx.canvas.width, to.y * ctx.canvas.height); ctx.stroke();
  }
  function drawRemote(message) {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); paintSegment(ctx, message.from, message.to, message.color, message.size * (canvas.width / 1000));
  }
  function handleBoardDown(event) {
    if (!whiteboardEnabled || !room || (!isTeacher && !whiteboardEnabled)) return;
    event.currentTarget.setPointerCapture(event.pointerId); previousPoint.current = canvasPoint(event); setIsDrawing(true);
  }
  function handleBoardMove(event) {
    if (!isDrawing || !previousPoint.current || !canvasRef.current) return;
    const next = canvasPoint(event); const segment = { type: "board", from: previousPoint.current, to: next, color: penColor, size: penSize };
    paintSegment(canvasRef.current.getContext("2d"), segment.from, segment.to, penColor, penSize * (canvasRef.current.width / 1000));
    sendData(segment); previousPoint.current = next;
  }
  function handleBoardUp() { setIsDrawing(false); previousPoint.current = null; }
  function clearCanvas(broadcast = true) {
    const canvas = canvasRef.current; if (canvas) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    if (broadcast && room) sendData({ type: "board-clear" });
  }

  const remoteParticipants = room ? [...room.remoteParticipants.values()] : [];
  const localParticipant = room?.localParticipant;
  const videoParticipants = localParticipant ? [localParticipant, ...remoteParticipants] : [];

  return <main className="live-classroom">
    <header className="live-topbar"><button onClick={leaveRoom}>← Dashboard</button><div className="live-brand">EduTrack <b>AI</b><span> / Live Classroom</span></div><div className="live-room-info"><i className={connected ? "online" : ""}/>{connected ? "Connected" : "Not connected"} · {roomName}</div></header>
    <div className="live-heading"><div><div className="live-kicker">{connected ? "● LIVE SESSION" : "VIRTUAL CLASSROOM"}</div><h1>{lecture.sub || lecture.title || "Classroom Lecture"}</h1><p>{lecture.teacher || studentEmail} · {lecture.room || lecture.classroom || roomName}</p></div><div className="live-participant-count">♙ {participants.length} joined</div></div>
    {!connected ? <section className="live-join-card"><div className="live-join-icon">▣</div><h2>Join the live classroom</h2><p>Allow camera and microphone access when your browser asks. Everyone using the same classroom link will join the same room.</p>{error && <div className="live-error">{error}</div>}<button className="live-primary" disabled={connecting} onClick={joinRoom}>{connecting ? "Connecting…" : "Join Classroom →"}</button><small>Room: {roomName}</small></section> : <>
      {error && <div className="live-error inline-error">{error}</div>}
      <section className="live-workspace">
        <div className="live-main-column">
          <div className="live-video-grid">
            {videoParticipants.map((participant) => <VideoTile key={participant.identity} participant={participant} attachVideo={attachVideo} />)}
            {videoParticipants.length === 0 && <div className="live-empty-video">Waiting for participants…</div>}
          </div>
          <div className="live-controls">
            <button className={!micOn ? "off" : ""} onClick={toggleMic}>{micOn ? "🎙 Mic on" : "🔇 Mic off"}</button>
            <button className={!cameraOn ? "off" : ""} onClick={toggleCamera}>{cameraOn ? "▣ Camera on" : "Camera off"}</button>
            <button className={screenOn ? "selected" : ""} onClick={toggleScreen}>▱ {screenOn ? "Stop sharing" : "Share screen"}</button>
            <button className="leave" onClick={leaveRoom}>☎ Leave</button>
          </div>
          <section className="live-whiteboard-panel">
            <div className="live-panel-heading"><div><b>✎ Collaborative Whiteboard</b><small>Draw diagrams and explain concepts together</small></div><div className="board-tools"><label>Pen <input type="color" value={penColor} onChange={(e) => setPenColor(e.target.value)}/></label><label>Size <input type="range" min="1" max="10" value={penSize} onChange={(e) => setPenSize(Number(e.target.value))}/></label><button onClick={() => clearCanvas(true)}>Clear board</button></div></div>
            <div className="live-canvas-wrap"><canvas ref={canvasRef} width="1600" height="900" onPointerDown={handleBoardDown} onPointerMove={handleBoardMove} onPointerUp={handleBoardUp} onPointerCancel={handleBoardUp} /></div>
            <p className="board-hint">Whiteboard strokes sync live with everyone in this classroom. Use a mouse, stylus or touch screen.</p>
          </section>
        </div>
        <aside className="live-side-panel"><div className="live-side-tabs"><button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}>Chat</button><button className={tab === "people" ? "active" : ""} onClick={() => setTab("people")}>People ({participants.length})</button></div>
          {tab === "chat" ? <><div className="live-chat-list">{chat.length ? chat.map((m, i) => <div className={`live-chat-message ${m.mine ? "mine" : ""}`} key={`${m.time}-${i}`}><b>{m.sender}</b><p>{m.text}</p><small>{m.time}</small></div>) : <div className="live-chat-empty">Messages will appear here. Say hello!</div>}</div><form className="live-chat-form" onSubmit={sendChat}><input value={chatText} onChange={(e) => setChatText(e.target.value)} placeholder="Send a message…"/><button disabled={!chatText.trim()}>➤</button></form></> : <div className="live-people-list">{participants.map((p) => <div key={p.identity}><span>{p.name.slice(0, 1).toUpperCase()}</span><b>{p.name}{p.isLocal ? " (You)" : ""}</b><small>{p.mic ? "Mic on" : "Muted"} · {p.camera ? "Camera on" : "Camera off"}</small></div>)}</div>}
        </aside>
      </section>
    </>}
  </main>;
}

function VideoTile({ participant, attachVideo }) {
  const videoRef = useRef(null);
  const [hasVideo, setHasVideo] = useState(false);
  useEffect(() => {
    const cleanup = attachVideo(videoRef.current, participant);
    const publication = participant.getTrackPublication(Track.Source.Camera);
    setHasVideo(Boolean(publication?.track));
    const onSubscribed = (track) => { if (track.source === Track.Source.Camera && videoRef.current) { track.attach(videoRef.current); setHasVideo(true); } };
    const onUnsubscribed = (track) => { if (track.source === Track.Source.Camera) { track.detach(videoRef.current); setHasVideo(false); } };
    participant.on(ParticipantEvent.TrackSubscribed, onSubscribed); participant.on(ParticipantEvent.TrackUnsubscribed, onUnsubscribed);
    return () => { cleanup?.(); participant.off(ParticipantEvent.TrackSubscribed, onSubscribed); participant.off(ParticipantEvent.TrackUnsubscribed, onUnsubscribed); };
  }, [participant, attachVideo]);
  return <div className="live-video-tile"><video ref={videoRef} autoPlay playsInline muted={participant.isLocal}/>{!hasVideo && <div className="live-avatar">{(participant.name || participant.identity || "U").slice(0, 1).toUpperCase()}</div>}<span>{participant.name || participant.identity}{participant.isLocal ? " (You)" : ""}</span></div>;
}
