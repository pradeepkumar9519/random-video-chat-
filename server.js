const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
  // CORS optional config if needed
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static("public"));

// Random waiting queue (one slot) and named rooms map
let waiting = null;
const rooms = {}; // rooms[roomId] = { ownerSocketId }

io.on("connection", socket => {
  console.log("User connected:", socket.id);

  // ---- RANDOM MATCHING ----
  socket.on("find", () => {
    // If some socket is waiting, pair them
    if (waiting && waiting.id !== socket.id) {
      const partner = waiting;
      waiting = null;

      // attach partners
      socket.partner = partner;
      partner.partner = socket;

      // caller (first) will be initiator (true)
      socket.emit("found", { isInitiator: true });
      partner.emit("found", { isInitiator: false });
    } else {
      // set waiting
      waiting = socket;
      // if socket disconnects while waiting, handled in 'disconnect'
    }
  });

  // ---- ROOM MODE ----
  // create room (roomId string)
  socket.on("create_room", (roomId) => {
    if (!roomId) {
      socket.emit("room_error", "Room ID missing");
      return;
    }
    if (rooms[roomId]) {
      socket.emit("room_error", "Room ID already exists");
      return;
    }
    rooms[roomId] = { owner: socket.id };
    socket.join(roomId);
    socket.roomId = roomId;
    socket.emit("room_created", { roomId });
    console.log(`Room ${roomId} created by ${socket.id}`);
  });

  // join room (roomId string)
  socket.on("join_room", (roomId) => {
    if (!roomId) {
      socket.emit("room_error", "Room ID missing");
      return;
    }
    const info = rooms[roomId];
    if (!info) {
      socket.emit("room_error", "Room not found");
      return;
    }
    // join room
    socket.join(roomId);
    socket.roomId = roomId;

    // find owner socket to pair
    const ownerSocketId = info.owner;
    const ownerSocket = io.sockets.sockets.get(ownerSocketId);

    if (!ownerSocket) {
      socket.emit("room_error", "Room owner not available");
      // cleanup
      delete rooms[roomId];
      return;
    }

    // attach partners
    socket.partner = ownerSocket;
    ownerSocket.partner = socket;

    // notify both: who is initiator? we choose owner as initiator (true)
    ownerSocket.emit("found_room", { roomId, isInitiator: true });
    socket.emit("found_room", { roomId, isInitiator: false });

    // optional: mark room as in-use so no other can join
    info.inUse = true;
    console.log(`User ${socket.id} joined room ${roomId}`);
  });

  // ---- SIGNALING MESSAGES (offer/answer/ice) ----
  socket.on("offer", (payload) => {
    // payload.target optional or use socket.partner
    if (socket.partner) {
      socket.partner.emit("offer", payload);
    } else if (payload && payload.target) {
      const s = io.sockets.sockets.get(payload.target);
      if (s) s.emit("offer", payload);
    }
  });

  socket.on("answer", (payload) => {
    if (socket.partner) {
      socket.partner.emit("answer", payload);
    } else if (payload && payload.target) {
      const s = io.sockets.sockets.get(payload.target);
      if (s) s.emit("answer", payload);
    }
  });

  socket.on("ice", (candidate) => {
    if (socket.partner) {
      socket.partner.emit("ice", candidate);
    } else if (candidate && candidate.target) {
      const s = io.sockets.sockets.get(candidate.target);
      if (s) s.emit("ice", candidate);
    }
  });

  // allow manual 'leave' from client
  socket.on("leave", () => {
    if (socket.partner) {
      socket.partner.partner = null;
      socket.partner.emit("leave");
    }
    cleanupSocket(socket);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    // if disconnected while waiting in queue
    if (waiting && waiting.id === socket.id) {
      waiting = null;
    }

    // if was room owner, delete room and inform others
    if (socket.roomId) {
      const rid = socket.roomId;
      if (rooms[rid] && rooms[rid].owner === socket.id) {
        // inform all in room and delete
        io.to(rid).emit("room_closed");
        delete rooms[rid];
      }
    }

    // notify partner
    if (socket.partner) {
      socket.partner.partner = null;
      socket.partner.emit("leave");
    }

    cleanupSocket(socket);
  });
});

function cleanupSocket(s) {
  try {
    s.leave && s.leave(s.roomId || "");
  } catch (e) {}
  if (s.roomId && rooms[s.roomId] && rooms[s.roomId].owner === s.id) {
    delete rooms[s.roomId];
  }
}

const PORT = process.env.PORT || 10000;
http.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
