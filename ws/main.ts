import { createClient } from 'https://esm.sh/@libsql/client@0.14.0';

// 初始化 Turso 客户端
const TURSO_URL = Deno.env.get('TURSO_URL') || 'libsql://deepchat-deep-sea-lab.aws-eu-west-1.turso.io';
const TURSO_AUTH_TOKEN = Deno.env.get('TURSO_AUTH_TOKEN') || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NDc1NjI4NDcsImlkIjoiZDRkYzMwYjQtNzRkMC00YmM2LWE3ZDgtNDA4ZTczOWU1MmFhIiwicmlkIjoiMDNmOTg0ZDYtYjI5YS00MmQ5LWFjYTQtNTllMmViY2M0M2EyIn0.iUwdEEtLAmUozEF6JTFt-TQmVC1nFBpvAiJXiBR8L1VvUm00B8Nu7ZjwZinFKMFqgBqBigRAsvZRQc0FPh6LBg';
console.log(`🔗 尝试连接 Turso: ${TURSO_URL}`);

const db = createClient({
    url: TURSO_URL,
    authToken: TURSO_AUTH_TOKEN,
});

try {
    // 测试连接并创建表
    await db.execute(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('✅ Turso 数据库连接成功');
} catch (error) {
    console.error('❌ Turso 连接失败:', error);
    console.error('请检查：');
    console.error('1. TURSO_URL 和 TURSO_AUTH_TOKEN 是否正确');
    console.error('2. 网络连接（代理、防火墙）');
    Deno.exit(1);
}

// 生成随机密钥
function generateResetKey(): string {
    try {
        return crypto.randomUUID();
    } catch (error) {
        console.error('❌ 生成密钥失败:', error);
        return 'fallback-key-' + Date.now();
    }
}

let resetKey = generateResetKey();

// 存储连接的客户端
const clients: Set<WebSocket> = new Set<WebSocket>();

// 心跳间隔
const HEARTBEAT_INTERVAL = 30000; // 30 秒

// 加载历史消息
async function loadMessageHistory(): Promise<string[]> {
    try {
        const result = await db.execute('SELECT content FROM messages ORDER BY timestamp ASC LIMIT 100');
        const messages = result.rows.map((row: any) => row.content as string);
        return messages;
    } catch (error) {
        console.error('❌ 加载历史消息失败:', error);
        return [];
    }
}

// 保存消息
async function saveMessageToDB(content: string) {
    try {
        await db.execute({
            sql: 'INSERT INTO messages (content) VALUES (?)',
            args: [content],
        });
    } catch (error) {
        console.error('❌ 保存消息失败:', error);
    }
}

// 清空聊天数据并重新生成密钥
async function clearChatData() {
    try {
        const oldResetKey = resetKey;
        await db.execute('DELETE FROM messages');
        resetKey = generateResetKey();
        messageHistory.length = 0;
        const newHistory = await loadMessageHistory();
        messageHistory.push(...newHistory);
        console.log(`🧹 聊天数据已清空，旧密钥: ${oldResetKey}`);
        console.log(`🔑 新重置密钥: ${resetKey} (${new Date().toISOString()})`);
        clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send('🧹 聊天记录已清空');
            }
        });
    } catch (error) {
        console.error('❌ 清空聊天数据失败:', error);
    }
}

// 初始化消息历史
const messageHistory = await loadMessageHistory();

// 提示页面 HTML
const htmlResponse = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>深海聊天室 - WebSocket 服务器</title>
    <link rel="icon" type="image/png" href="https://blog.deep-sea.dpdns.org/images/logo/favicon-256x256.webp">
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body {
            background-image: url('https://cx-mc-image.netlify.app/16.jpg');
            background-size: cover;
            background-position: center;
            background-attachment: fixed;
            background-repeat: no-repeat;
        }
        .container {
            background-color: rgba(255, 255, 255, 0.9);
            border-radius: 1rem;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
        }
    </style>
</head>
<body class="flex items-center justify-center min-h-screen">
    <div class="container max-w-lg p-8 text-center">
        <h1 class="text-3xl font-bold text-blue-900 mb-4">💬 深海聊天室</h1>
        <p class="text-lg text-gray-700 mb-6">
            这是一个 <span class="font-semibold">WebSocket 服务器</span>，无法通过浏览器直接访问。
        </p>
        <p class="text-md text-gray-600 mb-8">
            请使用支持 WebSocket 的客户端，例如 <a href="https://chat.deep-sea.dpdns.org" class="text-blue-500 hover:underline">深海聊天室</a>，通过 <code class="bg-gray-100 p-1 rounded">wss://deep-chat-server.deno.dev</code> 连接。
        </p>
        <div class="flex justify-center space-x-4">
            <a href="https://chat.deep-sea.dpdns.org" class="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition">
                打开聊天室
            </a>
            <a href="https://github.com/denoland/deno" class="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition">
                了解 Deno
            </a>
        </div>
    </div>
</body>
</html>
`;

// 处理 WebSocket 客户端
function handleWebSocket(ws: WebSocket) {
    console.log('🎉 新 WebSocket 客户端已连接');
    clients.add(ws);

    // 心跳机制
    (ws as any).lastPong = Date.now();

    ws.onopen = async () => {
        console.log('📡 WebSocket 已打开，推送历史消息');
        const messages = await loadMessageHistory();
        messageHistory.length = 0;
        messageHistory.push(...messages);
        messages.forEach((message) => ws.send(message));
    };

    ws.onmessage = async (event) => {
        try {
            const data = event.data.toString();
            console.log(`📩 收到数据: ${data}`);
            // 处理心跳
            if (data === '{"type":"PONG"}') {
                (ws as any).lastPong = Date.now();
                return;
            }
            // 处理聊天消息
            if (data.includes(resetKey)) {
                console.log('🔑 检测到重置密钥');
                await clearChatData();
                return;
            }
            if (data.includes(':')) {
                console.log(`📩 处理聊天消息: ${data}`);
                messageHistory.push(data);
                await saveMessageToDB(data);
                clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(data);
                    }
                });
            } else {
                console.log(`⚠️ 忽略无效消息: ${data}`);
            }
        } catch (error) {
            console.error('❌ 消息处理错误:', error);
            ws.send('❌ 服务器错误: 无法处理消息');
        }
    };

    ws.onclose = () => {
        console.log('😢 WebSocket 客户端已断开连接');
        clients.delete(ws);
    };

    ws.onerror = (error) => {
        console.error('⚠️ WebSocket 错误:', error);
        clients.delete(ws);
    };
}

// HTTP 和 WebSocket 服务器
async function startServer() {
    const port = 3008;

    // 心跳检查
    setInterval(() => {
        const now = Date.now();
        clients.forEach((ws) => {
            if (now - (ws as any).lastPong > HEARTBEAT_INTERVAL * 2) {
                console.log('🛑 客户端无响应，关闭连接');
                ws.close();
                clients.delete(ws);
                return;
            }
            if (ws.readyState === WebSocket.OPEN) {
                ws.send('{"type":"PING"}');
            }
        });
    }, HEARTBEAT_INTERVAL);

    const server = Deno.serve({
        port,
        // HTTPS 配置（本地测试可注释，生产环境启用）
        // cert: await Deno.readTextFile('C:/Users/LEE_S/desktop/ws/cert.pem'),
        // key: await Deno.readTextFile('C:/Users/LEE_S/desktop/ws/key.pem'),
    }, async (req: Request) => {
        const url = new URL(req.url);
        console.log(`🌐 收到请求: ${url.pathname} (${req.headers.get('upgrade') || 'HTTP'})`);

        // 处理 WebSocket 升级
        if (req.headers.get('upgrade') === 'websocket') {
            try {
                const { socket, response } = Deno.upgradeWebSocket(req);
                handleWebSocket(socket);
                return response;
            } catch (error) {
                console.error('❌ WebSocket 升级失败:', error);
                return new Response('WebSocket 升级失败', { status: 400 });
            }
        }

        // 处理 HTTP 请求
        if (url.pathname === '/' || url.pathname === '/index.html') {
            return new Response(htmlResponse, {
                status: 200,
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
        }

        // 404 响应
        return new Response('404 Not Found', { status: 404 });
    });

    console.log(`🔑 重置密钥: ${resetKey}`);
    console.log('🚀 深海聊天室，谁用谁弱智');
    console.log(`🚀 服务器正在监听 ${port} 端口`);

    // 优雅关闭
    Deno.addSignalListener('SIGINT', () => {
        console.log('🛑 正在关闭服务器...');
        db.close();
        clients.forEach((ws) => ws.close());
        server.shutdown();
        Deno.exit();
    });
}

// 启动服务器
startServer();