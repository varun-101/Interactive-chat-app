# Real-Time Chat Application

A full-stack real-time chat application built with React, Node.js, Socket.IO, and MongoDB. The application supports real-time messaging, online/offline status, typing indicators, and image sharing.

## Features

- Real-time messaging using Socket.IO
- User authentication with JWT
- Online/Offline user status
- Typing indicators
- Image sharing
- Message history
- Responsive design

## Tech Stack

### Frontend
- React.js
- Socket.IO Client
- Axios
- React Router DOM

### Backend
- Node.js
- Express.js
- Socket.IO
- MongoDB
- JWT for authentication
- Multer for file uploads

## Prerequisites

Before you begin, ensure you have the following installed:
- Node.js (v14 or higher)
- MongoDB
- Git

## Installation

1. Clone the repository

```bash
git clone https://github.com/varun-101/Interactive-chat-app.git
```

2. Install Server dependencies

```bash
cd Server
npm install
```

3. Install Client dependencies

```bash
cd client
npm install
```
4. Configure environment variables

Create a `.env` file in the `Server` directory and set the following variables: 

```
MONGO_URI=your_mongodb_uri
JWT_SECRET=your_jwt_secret
PORT=5000
```

## Running the Application

1. Start the MongoDB server
2. Start the Node.js server
3. Start the React development server

