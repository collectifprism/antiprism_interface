const http = require("http");
const fs   = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");
const { networkInterfaces } = require("os");

const PORT = 3000;

function getLocalIP() {
  for (const nets of Object.values(networkInterfaces())) {
    for (const net of nets) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "localhost";
}
const LOCAL_IP = getLocalIP();

const MIME = {
  ".html":"text/html", ".js":"application/javascript", ".css":"text/css",
  ".mp4":"video/mp4", ".webm":"video/webm", ".mp3":"audio/mpeg",
  ".ogg":"audio/ogg", ".wav":"audio/wav", ".jpg":"image/jpeg",
  ".jpeg":"image/jpeg", ".png":"image/png", ".gif":"image/gif",
  ".webp":"image/webp", ".svg":"image/svg+xml",
  ".ttf":"font/ttf", ".woff":"font/woff", ".woff2":"font/woff2",
  ".json":"application/json",
};

const server = http.createServer((req, res) => {
  if (req.url === "/config.json") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ip: LOCAL_IP, port: PORT }));
    return;
  }
  let urlPath = req.url.split("?")[0];
  if (urlPath === "/") urlPath = "/prism-corp.html";
  const filePath = path.join(__dirname, urlPath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || "application/octet-stream";
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("404 — " + urlPath); return; }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
const phones = new Map();
const controllers = new Set();

function safeSend(ws, data) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(data));
}
function broadcastPhoneList() {
  const list = [...phones.keys()];
  controllers.forEach(c => safeSend(c, { type: "phone_list", phones: list }));
}
function broadcastStatus(phoneId, status) {
  controllers.forEach(c => safeSend(c, { type: "phone_status", phoneId, status }));
}
function broadcastTaskDone(phoneId, task) {
  controllers.forEach(c => safeSend(c, { type: "task_done", phoneId, task }));
}

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    switch (msg.type) {
      case "register_phone": {
        const id = msg.phoneId;
        phones.set(id, ws); ws._role="phone"; ws._phoneId=id;
        console.log("📱 Tel connecté: "+id);
        safeSend(ws, { type:"registered", phoneId:id });
        broadcastPhoneList(); break;
      }
      case "register_controller": {
        controllers.add(ws); ws._role="controller"; ws._page=msg.page||"?";
        console.log("🖥  Contrôleur: "+ws._page);
        safeSend(ws, { type:"phone_list", phones:[...phones.keys()] }); break;
      }
      case "command": {
        const target = phones.get(msg.phoneId);
        if (target && target.readyState===1) {
          safeSend(target, { type:"command", action:msg.action, payload:msg.payload||{} });
          console.log("▶  "+msg.action+" → "+msg.phoneId+" ("+ws._page+")");
        } else {
          safeSend(ws, { type:"error", message:"Tel "+msg.phoneId+" non connecté" });
        }
        break;
      }
      case "status":    if (ws._phoneId) broadcastStatus(ws._phoneId, msg.status); break;
      case "task_done": if (ws._phoneId) { broadcastTaskDone(ws._phoneId, msg.task); console.log("✅ "+msg.task+" ← "+ws._phoneId); } break;
    }
  });
  ws.on("close", () => {
    if (ws._role==="phone") { phones.delete(ws._phoneId); console.log("📴 "+ws._phoneId); broadcastPhoneList(); }
    else if (ws._role==="controller") { controllers.delete(ws); console.log("🖥  déco "+ws._page); }
  });
  ws.on("error", e => console.error("❌",e.message));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("\n✅ Serveur PRISM démarré");
  console.log("   PRISM CORP  → http://"+LOCAL_IP+":"+PORT+"/prism-corp.html");
  console.log("   ANTIPRISM   → http://"+LOCAL_IP+":"+PORT+"/antiprism.html");
  console.log("   TÉLÉPHONES  → http://"+LOCAL_IP+":"+PORT+"/phone.html\n");
});