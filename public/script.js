const socket = io();
let localStream, peerConnection;
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const nextBtn = document.getElementById('nextBtn');

const servers = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

function startPeer() {
  peerConnection = new RTCPeerConnection(servers);
  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = event => {
    remoteVideo.srcObject = event.streams[0];
  };

  peerConnection.onicecandidate = event => {
    if (event.candidate) {
      socket.emit("ice", event.candidate);
    }
  };
}

navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  localStream = stream;
  localVideo.srcObject = stream;
  socket.emit("find");
}).catch(() => {
  alert("Camera/Mic ki permission do!");
});

socket.on("found", async (isInitiator) => {
  startPeer();
  if (isInitiator) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit("offer", offer);
  }
});

socket.on("offer", async (offer) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit("answer", answer);
});

socket.on("answer", async (answer) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on("ice", async (candidate) => {
  if (peerConnection) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  }
});

nextBtn.onclick = () => {
  if (peerConnection) {
    peerConnection.close();
  }
  remoteVideo.srcObject = null;
  socket.emit("find");
};
