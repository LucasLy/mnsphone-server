import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { GameRoom, GamePlayer, rooms } from './models';

export const initializeSocketEvents = (io: Server): void => {
  // Log when the Socket.IO server starts
  console.log('Socket.IO server initialized');

  // Connection event
  io.on('connection', (socket: Socket) => {
    console.log(`New connection: ${socket.id}`);

    // Send active rooms on connection
    emitActiveRooms(socket);

    // ROOM MANAGEMENT EVENTS

    // Create a new room
    socket.on('create-room', ({ nickname, profilePic }) => {
      try {
        const roomCode = generateRoomCode();
        const roomId = uuidv4();
        
        // Create the room
        const room: GameRoom = {
          id: roomId,
          code: roomCode,
          players: [{
            id: socket.id,
            nickname,
            profilePic,
            isHost: true,
            isReady: false
          }],
          gameState: 'lobby',
          currentRound: 0,
          maxRounds: 3,
          createdAt: new Date(),
          locked: false,
          sentences: [],
          drawings: [],
          presentationMode: {
            active: false,
            currentIndex: 0
          }
        };

        // Add room to memory
        rooms.set(roomId, room);
        
        // Join the socket to the room
        socket.join(roomId);
        console.log(`Room created: ${roomCode} (${roomId}) by ${nickname}`);
        
        // Emit room created event
        socket.emit('room-created', room);
        
        // Update active rooms
        emitActiveRoomsToAll(io);
      } catch (error) {
        console.error('Error creating room:', error);
        socket.emit('error', { message: 'Failed to create room' });
      }
    });

    // Join an existing room
    socket.on('join-room', ({ roomCode, nickname, profilePic }) => {
      try {
        // Find the room by code
        const room = findRoomByCode(roomCode);
        
        if (!room) {
          return socket.emit('error', { message: 'Room not found' });
        }
        
        if (room.locked) {
          return socket.emit('error', { message: 'Room is locked' });
        }
        
        if (room.gameState !== 'lobby') {
          return socket.emit('error', { message: 'Game has already started' });
        }
        
        // Add player to room
        room.players.push({
          id: socket.id,
          nickname,
          profilePic,
          isHost: false,
          isReady: false
        });
        
        // Join the socket to the room
        socket.join(room.id);
        console.log(`Player ${nickname} joined room: ${roomCode}`);
        
        // Emit room joined event to the player
        socket.emit('room-joined', room);
        
        // Emit player joined event to other players in the room
        socket.to(room.id).emit('player-joined', {
          playerId: socket.id,
          nickname,
          profilePic
        });
        
        // Update active rooms
        emitActiveRoomsToAll(io);
      } catch (error) {
        console.error('Error joining room:', error);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // Leave a room
    socket.on('leave-room', () => {
      try {
        const { room, player } = findPlayerRoom(socket.id);
        if (!room || !player) return;
        
        console.log(`Player ${player.nickname} leaving room: ${room.code}`);
        
        // Remove player from the room
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          room.players.splice(playerIndex, 1);
        }
        
        // Leave the socket room
        socket.leave(room.id);
        
        // If the room is now empty, remove it
        if (room.players.length === 0) {
          console.log(`Room ${room.code} is empty, removing`);
          rooms.delete(room.id);
        } else {
          // If the host left, assign a new host
          if (player.isHost && room.players.length > 0) {
            room.players[0].isHost = true;
            console.log(`New host assigned: ${room.players[0].nickname}`);
          }
          
          // Notify remaining players
          io.to(room.id).emit('player-left', {
            playerId: socket.id,
            updatedRoom: room
          });
        }
        
        // Update active rooms
        emitActiveRoomsToAll(io);
      } catch (error) {
        console.error('Error leaving room:', error);
      }
    });

    // Toggle ready status
    socket.on('toggle-ready', () => {
      try {
        const { room, player } = findPlayerRoom(socket.id);
        if (!room || !player) return;
        
        // Toggle ready status
        player.isReady = !player.isReady;
        
        // Emit updated room
        io.to(room.id).emit('room-updated', room);
      } catch (error) {
        console.error('Error toggling ready status:', error);
        socket.emit('error', { message: 'Failed to toggle ready status' });
      }
    });

    // Start the game
    socket.on('start-game', () => {
      try {
        const { room, player } = findPlayerRoom(socket.id);
        if (!room || !player) return;
        
        // Check if player is host
        if (!player.isHost) {
          return socket.emit('error', { message: 'Only the host can start the game' });
        }
        
        // Check if all players are ready
        const allReady = room.players.every(p => p.isReady || p.id === player.id);
        if (!allReady) {
          return socket.emit('error', { message: 'Not all players are ready' });
        }
        
        // Check minimum players
        if (room.players.length < 2) {
          return socket.emit('error', { message: 'Need at least 2 players to start' });
        }
        
        // Start the game
        room.gameState = 'writing';
        room.currentRound = 1;
        
        // Emit game started event
        io.to(room.id).emit('game-started', room);
        
        // Update active rooms
        emitActiveRoomsToAll(io);
      } catch (error) {
        console.error('Error starting game:', error);
        socket.emit('error', { message: 'Failed to start game' });
      }
    });

    // GAMEPLAY EVENTS

    // Submit a sentence
    socket.on('submit-sentence', ({ text }) => {
      try {
        const { room, player } = findPlayerRoom(socket.id);
        if (!room || !player) return;
        
        // Check game state
        if (room.gameState !== 'writing') {
          return socket.emit('error', { message: 'Cannot submit sentence in current game state' });
        }
        
        // Add sentence
        room.sentences.push({
          playerId: socket.id,
          text,
          round: room.currentRound
        });
        
        // Check if all players have submitted
        const submittedCount = room.sentences.filter(s => s.round === room.currentRound).length;
        if (submittedCount === room.players.length) {
          // Move to drawing phase
          room.gameState = 'drawing';
          io.to(room.id).emit('phase-changed', { phase: 'drawing' });
        }
        
        // Emit updated room
        io.to(room.id).emit('room-updated', room);
      } catch (error) {
        console.error('Error submitting sentence:', error);
        socket.emit('error', { message: 'Failed to submit sentence' });
      }
    });

    // Submit a drawing
    socket.on('submit-drawing', ({ imageData }) => {
      try {
        const { room, player } = findPlayerRoom(socket.id);
        if (!room || !player) return;
        
        // Check game state
        if (room.gameState !== 'drawing') {
          return socket.emit('error', { message: 'Cannot submit drawing in current game state' });
        }
        
        // Add drawing
        room.drawings.push({
          playerId: socket.id,
          imageData,
          round: room.currentRound
        });
        
        // Check if all players have submitted
        const submittedCount = room.drawings.filter(d => d.round === room.currentRound).length;
        if (submittedCount === room.players.length) {
          // If we've reached max rounds, go to results
          if (room.currentRound >= room.maxRounds) {
            room.gameState = 'results';
            io.to(room.id).emit('phase-changed', { phase: 'results' });
          } else {
            // Move to next round, writing phase
            room.currentRound += 1;
            room.gameState = 'writing';
            io.to(room.id).emit('phase-changed', { phase: 'writing' });
          }
        }
        
        // Emit updated room
        io.to(room.id).emit('room-updated', room);
      } catch (error) {
        console.error('Error submitting drawing:', error);
        socket.emit('error', { message: 'Failed to submit drawing' });
      }
    });

    // ROOM SETTINGS EVENTS

    // Update room settings
    socket.on('update-room-settings', ({ settings }) => {
      try {
        const { room, player } = findPlayerRoom(socket.id);
        if (!room || !player) return;
        
        // Check if player is host
        if (!player.isHost) {
          return socket.emit('error', { message: 'Only the host can update room settings' });
        }
        
        // Update settings
        if (settings.maxRounds) {
          room.maxRounds = settings.maxRounds;
        }
        
        // Emit updated room
        io.to(room.id).emit('room-updated', room);
      } catch (error) {
        console.error('Error updating room settings:', error);
        socket.emit('error', { message: 'Failed to update room settings' });
      }
    });

    // Kick a player
    socket.on('kick-player', ({ playerId }) => {
      try {
        const { room, player } = findPlayerRoom(socket.id);
        if (!room || !player) return;
        
        // Check if player is host
        if (!player.isHost) {
          return socket.emit('error', { message: 'Only the host can kick players' });
        }
        
        // Find the player to kick
        const playerToKick = room.players.find(p => p.id === playerId);
        if (!playerToKick) {
          return socket.emit('error', { message: 'Player not found' });
        }
        
        // Cannot kick self
        if (playerId === socket.id) {
          return socket.emit('error', { message: 'Cannot kick yourself' });
        }
        
        // Remove player from the room
        const playerIndex = room.players.findIndex(p => p.id === playerId);
        if (playerIndex !== -1) {
          room.players.splice(playerIndex, 1);
        }
        
        // Notify the kicked player
        io.to(playerId).emit('player-kicked');
        
        // Make the kicked player leave the room
        const kickedSocket = io.sockets.sockets.get(playerId);
        if (kickedSocket) {
          kickedSocket.leave(room.id);
        }
        
        // Notify remaining players
        io.to(room.id).emit('room-updated', room);
        
        // Update active rooms
        emitActiveRoomsToAll(io);
      } catch (error) {
        console.error('Error kicking player:', error);
        socket.emit('error', { message: 'Failed to kick player' });
      }
    });

    // Toggle room lock
    socket.on('toggle-room-lock', () => {
      try {
        const { room, player } = findPlayerRoom(socket.id);
        if (!room || !player) return;
        
        // Check if player is host
        if (!player.isHost) {
          return socket.emit('error', { message: 'Only the host can lock/unlock the room' });
        }
        
        // Toggle lock
        room.locked = !room.locked;
        
        // Notify players in the room
        io.to(room.id).emit('room-lock-changed', {
          roomCode: room.code,
          locked: room.locked
        });
        
        // Emit updated room
        io.to(room.id).emit('room-updated', room);
        
        // Update active rooms
        emitActiveRoomsToAll(io);
      } catch (error) {
        console.error('Error toggling room lock:', error);
        socket.emit('error', { message: 'Failed to toggle room lock' });
      }
    });

    // PRESENTATION EVENTS

    // Start presentation mode
    socket.on('start-presentation', () => {
      try {
        const { room, player } = findPlayerRoom(socket.id);
        if (!room || !player) return;
        
        // Check if player is host
        if (!player.isHost) {
          return socket.emit('error', { message: 'Only the host can start presentation mode' });
        }
        
        // Check game state
        if (room.gameState !== 'results') {
          return socket.emit('error', { message: 'Presentation mode only available in results phase' });
        }
        
        // Start presentation mode
        room.presentationMode = {
          active: true,
          currentIndex: 0
        };
        
        // Emit presentation started event
        io.to(room.id).emit('presentation-started', room.presentationMode);
      } catch (error) {
        console.error('Error starting presentation:', error);
        socket.emit('error', { message: 'Failed to start presentation mode' });
      }
    });

    // Show a specific result
    socket.on('show-result', (index) => {
      try {
        const { room, player } = findPlayerRoom(socket.id);
        if (!room || !player) return;
        
        // Check if player is host
        if (!player.isHost) {
          return socket.emit('error', { message: 'Only the host can control the presentation' });
        }
        
        // Check presentation mode
        if (!room.presentationMode?.active) {
          return socket.emit('error', { message: 'Presentation mode not active' });
        }
        
        // Update current index
        room.presentationMode.currentIndex = index;
        
        // Emit result changed event
        io.to(room.id).emit('result-changed', room.presentationMode);
      } catch (error) {
        console.error('Error showing result:', error);
        socket.emit('error', { message: 'Failed to show result' });
      }
    });

    // End presentation mode
    socket.on('end-presentation', () => {
      try {
        const { room, player } = findPlayerRoom(socket.id);
        if (!room || !player) return;
        
        // Check if player is host
        if (!player.isHost) {
          return socket.emit('error', { message: 'Only the host can end presentation mode' });
        }
        
        // Check presentation mode
        if (!room.presentationMode?.active) {
          return socket.emit('error', { message: 'Presentation mode not active' });
        }
        
        // End presentation mode
        room.presentationMode = {
          active: false,
          currentIndex: 0
        };
        
        // Emit presentation ended event
        io.to(room.id).emit('presentation-ended');
      } catch (error) {
        console.error('Error ending presentation:', error);
        socket.emit('error', { message: 'Failed to end presentation mode' });
      }
    });

    // Reset game
    socket.on('reset-game', () => {
      try {
        const { room, player } = findPlayerRoom(socket.id);
        if (!room || !player) return;
        
        // Check if player is host
        if (!player.isHost) {
          return socket.emit('error', { message: 'Only the host can reset the game' });
        }
        
        // Reset the game
        room.gameState = 'lobby';
        room.currentRound = 0;
        room.sentences = [];
        room.drawings = [];
        room.presentationMode = {
          active: false,
          currentIndex: 0
        };
        
        // Reset player ready status
        room.players.forEach(p => {
          p.isReady = false;
        });
        
        // Emit game reset event
        io.to(room.id).emit('game-reset');
        io.to(room.id).emit('room-updated', room);
        
        // Update active rooms
        emitActiveRoomsToAll(io);
      } catch (error) {
        console.error('Error resetting game:', error);
        socket.emit('error', { message: 'Failed to reset game' });
      }
    });

    // Get active rooms
    socket.on('get-active-rooms', () => {
      emitActiveRooms(socket);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`Disconnection: ${socket.id}`);
      
      try {
        const { room, player } = findPlayerRoom(socket.id);
        if (!room || !player) return;
        
        console.log(`Player ${player.nickname} disconnected from room: ${room.code}`);
        
        // Remove player from the room
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          room.players.splice(playerIndex, 1);
        }
        
        // If the room is now empty, remove it
        if (room.players.length === 0) {
          console.log(`Room ${room.code} is empty, removing`);
          rooms.delete(room.id);
        } else {
          // If the host left, assign a new host
          if (player.isHost && room.players.length > 0) {
            room.players[0].isHost = true;
            console.log(`New host assigned: ${room.players[0].nickname}`);
          }
          
          // Notify remaining players
          io.to(room.id).emit('player-left', {
            playerId: socket.id,
            updatedRoom: room
          });
        }
        
        // Update active rooms
        emitActiveRoomsToAll(io);
      } catch (error) {
        console.error('Error handling disconnect:', error);
      }
    });
  });
};

// Emit active rooms to a specific socket
const emitActiveRooms = (socket: Socket): void => {
  const activeRooms = getActiveRooms();
  socket.emit('active-rooms', activeRooms);
};

// Emit active rooms to all connected sockets
const emitActiveRoomsToAll = (io: Server): void => {
  const activeRooms = getActiveRooms();
  io.emit('active-rooms', activeRooms);
};

// Get active rooms
const getActiveRooms = (): Array<{ code: string; playerCount: number; locked: boolean }> => {
  return Array.from(rooms.values())
    .filter(room => room.gameState === 'lobby')
    .map(room => ({
      code: room.code,
      playerCount: room.players.length,
      locked: room.locked
    }));
};

// Helper function to find a room by code
const findRoomByCode = (code: string): GameRoom | null => {
  for (const room of rooms.values()) {
    if (room.code === code) {
      return room;
    }
  }
  return null;
};

// Helper function to find a player's room
const findPlayerRoom = (playerId: string): { room: GameRoom | null; player: GamePlayer | null } => {
  for (const room of rooms.values()) {
    const player = room.players.find(p => p.id === playerId);
    if (player) {
      return { room, player };
    }
  }
  return { room: null, player: null };
};

// Generate a random 4-character room code
const generateRoomCode = (): string => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  // Ensure code is unique
  if (findRoomByCode(code)) {
    return generateRoomCode();
  }
  
  return code;
}; 