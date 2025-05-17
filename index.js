const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 3008 });

// Store connected clients
const clients = new Set();

// Store message history
const messageHistory = [];

// Heartbeat interval to check connection health
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

wss.on("connection", (ws) => {
  console.log("🎉 新客户端已连接");
  clients.add(ws);

  // Send message history to the new client
  messageHistory.forEach((message) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });

  // Heartbeat mechanism
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (message) => {
    try {
      const receivedMessage = message.toString();
      console.log(`📩 收到消息: ${receivedMessage}`);

      // Store the message in history
      messageHistory.push(receivedMessage);

      // Broadcast message to all clients without prefix
      clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(receivedMessage);
        }
      });
    } catch (error) {
      console.error("❌ 消息处理错误:", error);
      ws.send("❌ 服务器错误: 无法处理消息");
    }
  });

  ws.on("close", () => {
    console.log("😢 客户端已断开连接");
    clients.delete(ws);
  });

  ws.on("error", (error) => {
    console.error("⚠️ WebSocket错误:", error);
    clients.delete(ws);
  });
});

// Heartbeat check
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      console.log("🛑 终止无响应客户端");
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

// Server error handling
wss.on("error", (error) => {
  console.error("🚨 服务器错误:", error);
});

console.log("🚀 深海聊天室，谁用谁弱智");
console.log("🚀 WebSocket服务器正在监听3008端口...");