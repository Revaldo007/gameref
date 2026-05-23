const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT || 4000);
const MONGO_URI = process.env.MONGO_URI;
const ROOM_ID = "4587";
const MAX_PLAYERS = 4;
const MAX_LIVES = 5;
const TEAM_COLORS = ["#1789ff", "#a649ff", "#20d879", "#ff4f86"];

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

let ProfileModel = null;

app.use(express.json());
app.use((request, response, next) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (request.method === "OPTIONS") {
    response.sendStatus(204);
    return;
  }
  next();
});

const defaultFriends = [
  { id: "luna", name: "Luna", status: "Online", color: TEAM_COLORS[1] },
  { id: "zane-bot", name: "Zane", status: "Online", color: TEAM_COLORS[2] },
  { id: "maya-bot", name: "Maya", status: "Online", color: TEAM_COLORS[3] },
  { id: "rex", name: "Rex", status: "Offline", color: "#ffb33f" },
  { id: "nova", name: "Nova", status: "Offline", color: "#65d6ff" },
];

const rooms = new Map();

function getRoom(roomId = ROOM_ID) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      players: [],
      friends: defaultFriends,
      startedAt: null,
    });
  }
  return rooms.get(roomId);
}

function cleanPlayer(player = {}, index = 0) {
  return {
    id: String(player.id || `guest-${Date.now()}-${index}`),
    name: String(player.name || "Player").slice(0, 18),
    level: Number(player.level || 1),
    role: index === 0 ? "HOST" : player.role || "READY",
    status: player.status || "READY",
    art: player.art || "",
    accent: player.accent || ["gold", "violet", "blue", "red"][index % 4],
    color: player.color || TEAM_COLORS[index % TEAM_COLORS.length],
    vehicle: player.vehicle || "Interceptor GT",
    outfit: player.outfit || "blue",
    lives: Number.isFinite(player.lives) ? player.lives : MAX_LIVES,
  };
}

function normalizePlayers(players) {
  const unique = new Map();
  const names = new Set();
  players.forEach((player, index) => {
    const cleaned = cleanPlayer(player, index);
    if (names.has(cleaned.name)) return;
    names.add(cleaned.name);
    unique.set(cleaned.id, cleaned);
  });
  return Array.from(unique.values()).slice(0, MAX_PLAYERS).map((player, index) => ({
    ...player,
    role: index === 0 ? "HOST" : player.role === "HOST" ? "READY" : player.role,
    color: player.color || TEAM_COLORS[index % TEAM_COLORS.length],
  }));
}

function roomPayload(room) {
  return {
    roomId: room.id,
    players: normalizePlayers(room.players),
    friends: room.friends,
    startedAt: room.startedAt,
  };
}

async function saveProfile(player) {
  if (!ProfileModel) return;
  try {
    await ProfileModel.findOneAndUpdate({ id: player.id }, player, {
      upsert: true,
      setDefaultsOnInsert: true,
    });
  } catch (error) {
    console.warn("Profile save skipped:", error.message);
  }
}

if (MONGO_URI) {
  mongoose
    .connect(MONGO_URI)
    .then(() => {
      const profileSchema = new mongoose.Schema(
        {
          id: { type: String, unique: true },
          name: String,
          level: Number,
          color: String,
          vehicle: String,
          outfit: String,
          lives: Number,
        },
        { timestamps: true },
      );
      ProfileModel = mongoose.model("Profile", profileSchema);
      console.log("MongoDB connected for lobby profiles.");
    })
    .catch((error) => {
      console.warn("MongoDB connection skipped:", error.message);
    });
}

app.get("/api/health", (request, response) => {
  response.json({
    ok: true,
    room: ROOM_ID,
    mongo: mongoose.connection.readyState === 1,
  });
});

app.get("/api/friends", (request, response) => {
  response.json({ friends: defaultFriends });
});

app.get("/api/rooms/:roomId", (request, response) => {
  response.json(roomPayload(getRoom(request.params.roomId)));
});

io.on("connection", (socket) => {
  let activeRoomId = null;
  let activePlayerId = null;

  socket.on("lobby:join", async ({ roomId = ROOM_ID, profile = {} } = {}) => {
    const room = getRoom(roomId);
    const player = cleanPlayer(profile, room.players.length);
    activeRoomId = roomId;
    activePlayerId = player.id;
    socket.join(roomId);
    room.players = normalizePlayers([
      player,
      ...room.players.filter(
        (item) => item.id !== player.id && item.name !== player.name,
      ),
    ]);
    await saveProfile(player);
    io.to(roomId).emit("lobby:update", roomPayload(room));
  });

  socket.on("lobby:invite", ({ roomId = ROOM_ID, friend = {} } = {}) => {
    const room = getRoom(roomId);
    if (room.players.length >= MAX_PLAYERS) return;
    const player = cleanPlayer(friend, room.players.length);
    if (room.players.some((item) => item.id === player.id || item.name === player.name))
      return;
    room.players = normalizePlayers([...room.players, player]);
    io.to(roomId).emit("lobby:update", roomPayload(room));
  });

  socket.on("game:start", ({ roomId = ROOM_ID, players = [] } = {}) => {
    const room = getRoom(roomId);
    room.players = normalizePlayers(players.length ? players : room.players);
    room.startedAt = Date.now();
    io.to(roomId).emit("game:start", roomPayload(room));
  });

  socket.on("player:update", ({ roomId = activeRoomId || ROOM_ID, player = {} } = {}) => {
    const cleanUpdate = {
      id: String(player.id || activePlayerId || socket.id),
      name: String(player.name || "Player").slice(0, 18),
      color: player.color || TEAM_COLORS[0],
      lives: Number.isFinite(player.lives) ? player.lives : MAX_LIVES,
      x: Number(player.x || 0),
      y: Number(player.y || 0),
      vx: Number(player.vx || 0),
      vy: Number(player.vy || 0),
      angle: Number(player.angle || 0),
    };
    socket.to(roomId).emit("player:update", { player: cleanUpdate });
  });

  socket.on("disconnect", () => {
    if (!activeRoomId || !activePlayerId) return;
    const room = getRoom(activeRoomId);
    room.players = normalizePlayers(
      room.players.filter((player) => player.id !== activePlayerId),
    );
    io.to(activeRoomId).emit("lobby:update", roomPayload(room));
  });
});

server.listen(PORT, () => {
  console.log(`Lobby server running on http://localhost:${PORT}`);
});
