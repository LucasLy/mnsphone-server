// Game types and interfaces
export type GameState = 'lobby' | 'writing' | 'drawing' | 'results';

export interface GamePlayer {
  id: string;
  nickname: string;
  profilePic: string;
  isHost: boolean;
  isReady: boolean;
}

export interface Sentence {
  playerId: string;
  text: string;
  round: number;
}

export interface Drawing {
  playerId: string;
  imageData: string; // Base64 encoded image data
  round: number;
}

export interface PresentationMode {
  active: boolean;
  currentIndex: number;
}

export interface GameRoom {
  id: string;
  code: string;
  players: GamePlayer[];
  gameState: GameState;
  currentRound: number;
  maxRounds: number;
  createdAt: Date;
  locked: boolean;
  sentences: Sentence[];
  drawings: Drawing[];
  presentationMode: PresentationMode;
}

// In-memory storage for game rooms
export const rooms: Map<string, GameRoom> = new Map(); 