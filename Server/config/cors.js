const corsOptions = {
  origin: [
    "https://interactive-chat-app-evo2.vercel.app",
    "https://interactive-chat-app-evo2-cx04wjnoa.vercel.app",
    "http://localhost:3000"
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['set-cookie']
};

export default corsOptions; 