import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeSocketEvents } from './socket';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,https://mnsphone.vercel.app').split(',');

// Create Express app
const app = express();

// Configure CORS
app.use(cors({
  origin: ALLOWED_ORIGINS,
  methods: ['GET', 'POST'],
  credentials: true
}));

// Create HTTP server
const server = http.createServer(app);

// Create Socket.IO server
const io = new SocketIOServer(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 30000,
  pingInterval: 10000,
  upgradeTimeout: 15000,
  maxHttpBufferSize: 1e6 // 1MB
});

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'MNSphone Socket.IO server is running',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Debug endpoint to check active connections
app.get('/status', (req, res) => {
  const connections = Array.from(io.sockets.sockets.values()).map(socket => ({
    id: socket.id,
    connected: socket.connected
  }));

  res.status(200).json({
    status: 'ok',
    connections: {
      count: connections.length,
      sockets: connections
    },
    timestamp: new Date().toISOString()
  });
});

// Initialize Socket.IO events
initializeSocketEvents(io);

// Start the server
server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
}); 