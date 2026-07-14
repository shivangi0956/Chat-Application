import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Server } from "socket.io";
import { createServer } from "http";

// Simple In-Memory Data Store (since we don't have MongoDB setup)
interface User {
  id: string;
  name: string;
  avatar: string;
  status: 'online' | 'offline';
  lastSeen: string;
}

interface Message {
  id: string;
  senderId: string;
  receiverId?: string; // For DM
  groupId?: string;    // For Groups
  text: string;
  timestamp: string;
  status: 'sent' | 'delivered' | 'read';
}

const users: Record<string, User> = {
  'user-1': { id: 'user-1', name: 'Shilpa', avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026024d', status: 'online', lastSeen: new Date().toISOString() },
  'user-2': { id: 'user-2', name: 'Shikha', avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026704d', status: 'offline', lastSeen: new Date().toISOString() },
  'user-3': { id: 'user-3', name: 'Shivi', avatar: 'https://i.pravatar.cc/150?u=a04258114e29026702d', status: 'online', lastSeen: new Date().toISOString() },
};

const messages: Message[] = [
  { id: 'm1', senderId: 'user-2', receiverId: 'me', text: 'Hey there! How are you?', timestamp: new Date(Date.now() - 3600000).toISOString(), status: 'read' },
  { id: 'm2', senderId: 'me', receiverId: 'user-2', text: 'I am doing great, thanks for asking!', timestamp: new Date(Date.now() - 3500000).toISOString(), status: 'read' },
  { id: 'm3', senderId: 'user-3', groupId: 'group-1', text: 'Has anyone seen the new design?', timestamp: new Date(Date.now() - 7200000).toISOString(), status: 'read' },
];

async function startServer() {
  const app = express();
  const PORT = 3000;
  const httpServer = createServer(app);
  
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  app.use(express.json());

  // API Routes
  app.get("/api/users", (req, res) => {
    res.json(Object.values(users));
  });

  app.get("/api/messages/:userId", (req, res) => {
    const { userId } = req.params;
    const chatMessages = messages.filter(
      m => (m.senderId === userId && m.receiverId === 'me') || 
           (m.senderId === 'me' && m.receiverId === userId)
    );
    res.json(chatMessages);
  });
  
  app.get("/api/messages/group/:groupId", (req, res) => {
    const { groupId } = req.params;
    const chatMessages = messages.filter(m => m.groupId === groupId);
    res.json(chatMessages);
  });

  // Socket.io for Real-time
  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    
    // Simulate setting current user active
    socket.emit('user_status_change', { userId: 'me', status: 'online' });

    socket.on("send_message", (data) => {
      const newMessage: Message = {
        id: `m-${Date.now()}`,
        senderId: data.senderId || 'me',
        receiverId: data.receiverId,
        groupId: data.groupId,
        text: data.text,
        timestamp: new Date().toISOString(),
        status: 'sent'
      };
      
      messages.push(newMessage);
      
      // In a real app, we'd emit only to specific rooms/users
      io.emit("receive_message", newMessage);
      
      // Simulate reply if talking to bot/other user
      if (data.receiverId && data.receiverId !== 'me') {
        const userName = users[data.receiverId]?.name || 'User';
        const userMessageText = data.text || '';
        
        const getConversationalReply = (text: string) => {
          const lower = text.toLowerCase();
          if (lower.match(/\b(hi|hello|hey|greetings)\b/)) {
            const greetings = [`Hey there!`, `Hi! How are you doing?`, `Hello! Great to hear from you.`];
            return greetings[Math.floor(Math.random() * greetings.length)];
          }
          if (lower.includes('how are you')) {
            return "I'm doing pretty well, thanks for asking! How about you?";
          }
          if (lower.includes('what are you doing') || lower.includes("what's up") || lower.includes('whats up')) {
            return "Just hanging out. Working on some new stuff. You?";
          }
          if (lower.match(/\b(bye|see ya|goodbye)\b/)) {
            return `Catch you later! Have a great day.`;
          }
          if (lower.match(/\b(thanks|thank you|thx)\b/)) {
            return "You're very welcome!";
          }
          if (lower.match(/\b(yes|yep|yeah|sure)\b/)) {
            return "Awesome. Sounds like a plan.";
          }
          if (lower.match(/\b(no|nope|nah)\b/)) {
            return "Ah, I see. No worries.";
          }
          if (lower.match(/\b(cool|nice|awesome|great)\b/)) {
            return "Right? I thought so too!";
          }
          
          const genericReplies = [
            `That's interesting! Tell me more.`,
            `I totally agree.`,
            `Oh really? I had no idea.`,
            `Hmm, let me think about that...`,
            `Sounds good to me!`,
            `Haha, that's funny.`,
            `I'm not sure I understand, but okay!`,
            `Anyway, how have you been lately?`
          ];
          return genericReplies[Math.floor(Math.random() * genericReplies.length)];
        };

        setTimeout(() => {
          socket.emit('typing', { userId: data.receiverId, isTyping: true });
          setTimeout(() => {
             const replyText = getConversationalReply(userMessageText);
             const reply: Message = {
                id: `m-rep-${Date.now()}`,
                senderId: data.receiverId,
                receiverId: 'me',
                text: replyText,
                timestamp: new Date().toISOString(),
                status: 'sent'
             };
             messages.push(reply);
             io.emit("receive_message", reply);
             socket.emit('typing', { userId: data.receiverId, isTyping: false });
          }, 2000 + Math.random() * 2000); // randomize typing delay
        }, 500 + Math.random() * 1000); // randomize read delay
      }
    });
    
    socket.on('typing', (data) => {
       socket.broadcast.emit('typing', data);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
