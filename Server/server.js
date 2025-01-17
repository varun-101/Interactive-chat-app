import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import Message from './models/Message.js';
import authRoutes from './routes/auth.js';
import messageRoutes from './routes/messages.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import session from 'express-session';

const corsOptions = {
  origin: [
    "https://interactive-chat-app-evo2.vercel.app",
    "https://interactive-chat-app-evo2-cx04wjnoa.vercel.app",
    "http://localhost:3000"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
};

const app = express();
const httpServer = createServer(app);

// Apply CORS before any routes
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Socket.IO setup with simplified configuration
const io = new Server(httpServer, {
  cors: corsOptions,
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  cookie: {
    name: "io",
    path: "/",
    httpOnly: true,
    sameSite: "none",
    secure: true
  }
});

// Add session middleware
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    sameSite: 'none',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
});

app.use(sessionMiddleware);

// Wrap socket middleware
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// Socket connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });

  socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
  });

  // ... rest of your socket event handlers
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ message: 'Internal server error', error: err.message });
});

dotenv.config();
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/messages', messageRoutes);

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => {
  console.error('MongoDB connection error:', err.message);
  process.exit(1); // Exit the process if we can't connect to MongoDB
});

// Online users store
const onlineUsers = new Map();

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Handle authentication
  socket.on('authenticate', (token) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      console.log('Socket authenticated:', socket.id, 'User:', socket.userId);
    } catch (error) {
      console.error('Socket authentication failed:', error);
    }
  });

  socket.on('user_connected', (userData) => {
    console.log('User connected event:', userData);
    if (userData && userData.userId) {
      onlineUsers.set(userData.userId, {
        socketId: socket.id,
        username: userData.username
      });
      
      const onlineUsersList = Array.from(onlineUsers.entries()).map(([userId, data]) => ({
        userId,
        username: data.username
      }));
      io.emit('users_status', onlineUsersList);
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('Client disconnected:', socket.id, 'Reason:', reason);
    // Remove user from online users
    for (const [userId, data] of onlineUsers.entries()) {
      if (data.socketId === socket.id) {
        onlineUsers.delete(userId);
        break;
      }
    }
    // Emit updated users list
    const onlineUsersList = Array.from(onlineUsers.entries()).map(([userId, data]) => ({
      userId,
      username: data.username
    }));
    io.emit('users_status', onlineUsersList);
  });

  // Add typing event handler
  socket.on('typing', (data) => {
    const { to, from, username, isTyping } = data;
    const toUserData = onlineUsers.get(to);
    if (toUserData) {
      io.to(toUserData.socketId).emit('user_typing', {
        userId: from,
        username,
        isTyping
      });
    }
  });

  socket.on('send_message', async (data) => {
    const { to, message, from, type, image } = data;
    const toUserData = onlineUsers.get(to);
    
    try {
      const newMessage = new Message({
        sender: from,
        receiver: to,
        content: message,
        type: type || 'text',
        imageUrl: image,
        timestamp: new Date()
      });
      const savedMessage = await newMessage.save();
      
      const messageData = {
        message: message,
        from: from,
        type: type || 'text',
        image: image,
        timestamp: new Date(),
        _id: savedMessage._id
      };

      // Send to recipient if online
      if (toUserData) {
        io.to(toUserData.socketId).emit('receive_message', messageData);
      }

      // Send confirmation back to sender
      socket.emit('message_sent', messageData);
      
    } catch (error) {
      console.error('Error saving message:', error);
      socket.emit('message_error', { error: 'Failed to send message' });
    }
  });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }
  const imageUrl = `${process.env.API_URL}/uploads/${req.file.filename}`;
  res.json({ imageUrl });
});

// Add OPTIONS handling for preflight requests
app.options('*', cors(corsOptions));

// Add headers middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Credentials', true);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  next();
});

// Add error handling for socket.io
io.engine.on("connection_error", (err) => {
  console.log(err.req);      // the request object
  console.log(err.code);     // the error code, for example 1
  console.log(err.message);  // the error message, for example "Session ID unknown"
  console.log(err.context);  // some additional error context
});

// Add this near your other routes
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Add socket connection logging
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  socket.on('disconnect', (reason) => {
    console.log('Client disconnected:', socket.id, 'Reason:', reason);
  });

});
