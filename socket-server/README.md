# Socket.IO Server for MNS Phone

This is a standalone Socket.IO server for the MNS Phone application. It handles real-time communication for the game, including room management, gameplay events, and synchronization between players.

## Features

- Room creation and management
- Player connection handling
- Game state synchronization
- Drawing and sentence submission
- Presentation mode for game results

## Prerequisites

- Node.js (v16+)
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone https://github.com/YourUsername/mnsphone-server.git
cd mnsphone-server
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Configure environment variables:
Copy the `.env.example` file to `.env` and update the values as needed:
```bash
cp .env.example .env
```

## Configuration

Edit the `.env` file to configure:

- `PORT`: The port the server will run on (default: 3001)
- `ALLOWED_ORIGINS`: Comma-separated list of origins allowed to connect to the server
- `LOG_LEVEL`: Level of logging (info, debug, error)

## Running the Server

### Development

```bash
npm run dev
# or
yarn dev
```

### Production

Build the server:
```bash
npm run build
# or
yarn build
```

Start the server:
```bash
npm start
# or
yarn start
```

## Deploying to a VPS

1. Set up a VPS with Node.js installed (v16+)
2. Clone the repository to your VPS
3. Install dependencies
4. Configure environment variables
5. Build the server
6. Set up a process manager like PM2:

```bash
npm install -g pm2
pm2 start dist/index.js --name mnsphone-server
pm2 save
pm2 startup
```

## Integrating with the Frontend

Update your frontend to connect to this Socket.IO server by setting the appropriate connection URL in your Socket.IO client:

```typescript
const socket = io('https://your-server-domain.com', {
  transports: ['polling'],
  withCredentials: true
});
```

## License

MIT 