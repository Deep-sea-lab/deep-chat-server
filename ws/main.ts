// 导入 Node.js 的 ws 库，兼容 Deno
import { WebSocketServer, WebSocket } from 'ws';

// 创建 WebSocket 服务器
const wss: WebSocketServer = new WebSocketServer({ port: 3008 });

// 存储连接的客户端
const clients: Set<WebSocket> = new Set<WebSocket>();

// 消息存储文件路径
const MESSAGE_FILE = 'chat_history.json';

// 心跳间隔以检查连接健康
const HEARTBEAT_INTERVAL = 30000; // 30 秒

// 初始化消息历史
let messageHistory: string[] = [];

// 加载历史消息
async function loadMessageHistory() {
    try {
        const exists = await Deno.stat(MESSAGE_FILE).then(() => true).catch(() => false);
        if (exists) {
            const data = await Deno.readTextFile(MESSAGE_FILE);
            messageHistory = JSON.parse(data);
        }
    } catch (error) {
        console.error('❌ 加载历史消息失败:', error);
    }
}

// 保存消息到文件的函数
async function saveMessageToFile() {
    try {
        await Deno.writeTextFile(MESSAGE_FILE, JSON.stringify(messageHistory, null, 2));
    } catch (error) {
        console.error('❌ 保存消息到文件失败:', error);
    }
}

// 加载历史消息
await loadMessageHistory();

wss.on("connection", (ws: WebSocket) => {
    console.log("🎉 新客户端已连接");
    clients.add(ws);

    // 发送历史消息给新连接的客户端
    messageHistory.forEach((message) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
        }
    });

    // 心跳机制
    (ws as any).isAlive = true;
    ws.on("pong", () => {
        (ws as any).isAlive = true;
    });

    ws.on("message", async (message: WebSocket.Data) => {
        try {
            const receivedMessage = message.toString();
            console.log(`📩 收到消息: ${receivedMessage}`);

            // 将消息存储在历史记录中
            messageHistory.push(receivedMessage);
            // 保存到文件
            await saveMessageToFile();

            // 广播消息给所有客户端
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

// 心跳检查
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!(ws as any).isAlive) {
            console.log("🛑 终止无响应客户端");
            return ws.terminate();
        }
        (ws as any).isAlive = false;
        ws.ping();
    });
}, HEARTBEAT_INTERVAL);

// 服务器错误处理
wss.on("error", (error) => {
    console.error("🚨 服务器错误:", error);
});

console.log("🚀 深海聊天室，谁用谁弱智");
console.log("🚀 WebSocket服务器正在监听3008端口...");