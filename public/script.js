const socket = io();
let localStream = null;
let pc = null;
let currentMode = null; // "random" or "room"
let currentRoomId = null;
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const findBtn = document.getElementById("findBtn");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const roomIdInput = document.getElementById("roomIdInput");
const statusBox = document.getElementById("status");
const nextBtn = document.getElementById("nextBtn");
const hangupBtn = document.getElementById("hangupBtn");

const servers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" }
  ]
};

function logStatus(s) {
  statusBox.textContent = `Status: ${s}`;
}

async function startLocal() {
  if (localStream) return;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    logStatus("Local media ready");
  } catch (e) {
    alert("Camera/Mic permission chahiye — allow karo.");
    logStatus("No media");
    throw e;
  }
}

function createPeerConnection() {
  pc = new RTCPeerConnection(servers);

  // add local tracks
  if (localStream) {
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  }

  pc.ontrack = (ev) => {
    if (ev.streams && ev.streams[0]) remoteVideo.srcObject = ev.streams[0];
  };

  pc.onicecandidate = (ev) => {
    if (ev.candidate) {
      socket.emit("ice", ev.candidate);
    }
  };

  pc.onconnectionstatechange = () => {
    if (!pc) return;
    console.log("PC state:", pc.connectionState);
    if (pc.connectionState === "connected") {
      logStatus("Connected");
    } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
      logStatus("Disconnected");
    }
  };
}

// ------------------ Random Match ------------------
findBtn.onclick = async () => {
  try {
    await startLocal();
  } catch { return; }
  currentMode = "random";
  createPeerConnection();
  logStatus("Looking for random partner...");
  socket.emit("find");
};

// ------------------ Room Mode ------------------
createRoomBtn.onclick = async () => {
  const id = (roomIdInput.value || "").trim();
  if (!id) return alert("Room ID daalo (jaise: call123)");
  try {
    await startLocal();
  } catch { return; }
  currentMode = "room";
  currentRoomId = id;
  createPeerConnection();
  socket.emit("create_room", id);
  logStatus("Room create request sent: " + id);
};

joinRoomBtn.onclick = async () => {
  const id = (roomIdInput.value || "").trim();
  if (!id) return alert("Room ID daalo (jaise: call123)");
  try {
    await startLocal();
  } catch { return; }
  currentMode = "room";
  currentRoomId = id;
  createPeerConnection();
  socket.emit("join_room", id);
  logStatus("Joining room: " + id);
};

// ------------------ Hangup / Next ------------------
hangupBtn.onclick = () => {
  if (pc) {
    pc.close();
    pc = null;
  }
  remoteVideo.srcObject = null;
  socket.emit("leave");
  logStatus("Call ended");
};

nextBtn.onclick = () => {
  // only for random mode
  if (pc) {
    pc.close();
    pc = null;
  }
  remoteVideo.srcObject = null;
  socket.emit("find");
  logStatus("Looking for new partner...");
};

// ------------------ Socket events ------------------
socket.on("found", async ({ isInitiator }) => {
  // random match found
  logStatus("Partner found (random). Initiator: " + isInitiator);
  if (!pc) createPeerConnection();

  if (isInitiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("offer", offer);
  }
});

socket.on("found_room", async ({ roomId, isInitiator }) => {
  logStatus(`Room match found (${roomId}). Initiator: ${isInitiator}`);
  if (!pc) createPeerConnection();
  if (isInitiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("offer", offer);
  }
});

socket.on("offer", async (offer) => {
  logStatus("Offer received");
  if (!pc) createPeerConnection();
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit("answer", answer);
});

socket.on("answer", async (answer) => {
  logStatus("Answer received");
  if (pc) {
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }
});

socket.on("ice", async (candidate) => {
  if (!pc) return;
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (e) {
    console.warn("ICE add failed:", e);
  }
});

socket.on("room_created", ({ roomId }) => {
  logStatus("Room created: " + roomId + " — waiting for joiner...");
});

socket.on("room_error", (msg) => {
  alert("Room error: " + msg);
  logStatus("Room error: " + msg);
  if (pc) { pc.close(); pc = null; }
});

socket.on("leave", () => {
  logStatus("Partner left");
  if (pc) { pc.close(); pc = null; }
  remoteVideo.srcObject = null;
});

socket.on("room_closed", () => {
  alert("Room was closed by owner");
  logStatus("Room closed");
  if (pc) { pc.close(); pc = null; }
  remoteVideo.srcObject = null;
});

// initial check for camera
(async () => {
  try {
    await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    logStatus("Camera allowed (ready).");
  } catch (e) {
    logStatus("Camera not allowed");
  }
})();
