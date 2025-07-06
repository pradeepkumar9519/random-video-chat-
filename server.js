const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static("public"));

let waiting = null;

io.on("connection", socket => {
  console.log("User connected:", socket.id);

  socket.on("find", () => {
    if (waiting) {
      const partner = waiting;
      waiting = null;

      socket.partner = partner;
      partner.partner = socket;

      socket.emit("found", true);
      partner.emit("found", false);
    } else {
      waiting = socket;
    }
  });

  socket.on("offer", offer => {
    if (socket.partner) {
      socket.partner.emit("offer", offer);
    }
  });

  socket.on("answer", answer => {
    if (socket.partner) {
      socket.partner.emit("answer", answer);
    }
  });

  socket.on("ice", candidate => {
    if (socket.partner) {
      socket.partner.emit("ice", candidate);
    }
  });

  socket.on("disconnect", () => {
    if (socket.partner) {
      socket.partner.partner = null;
      socket.partner.emit("leave");
    }
    if (waiting === socket) {
      waiting = null;
    }
    console.log("User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 10000;
http.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
