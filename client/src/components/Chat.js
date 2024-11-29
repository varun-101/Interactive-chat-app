import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

function Chat() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [socket, setSocket] = useState(null);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState({});
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const messagesEndRef = useRef(null);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState({});
  const typingTimeoutRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [allUsers, setAllUsers] = useState([]);

  useEffect(() => {
    const newSocket = io(process.env.REACT_APP_API_URL || 'http://localhost:5000');
    setSocket(newSocket);

    return () => newSocket.close();
  }, []);

  useEffect(() => {
    if (socket && user) {
      socket.emit('user_connected', { userId: user.userId, username: user.username });

      socket.on('users_status', (users) => {
        const otherUsers = users.filter(u => u.userId !== user.userId);
        setOnlineUsers(otherUsers);

        setAllUsers(prev => {
          const updatedUsers = [...prev];
          
          updatedUsers.forEach(u => {
            u.isOnline = otherUsers.some(online => online.userId === u.userId);
          });

          otherUsers.forEach(onlineUser => {
            if (!updatedUsers.some(u => u.userId === onlineUser.userId)) {
              updatedUsers.push({
                userId: onlineUser.userId,
                username: onlineUser.username,
                isOnline: true
              });
            }
          });

          return updatedUsers;
        });
      });

      socket.on('receive_message', (data) => {
        if (data.from !== user.userId) {
          setMessages(prev => ({
            ...prev,
            [data.from]: [...(prev[data.from] || []), data]
          }));
        }
      });

      socket.on('user_typing', ({ userId, username, isTyping }) => {
        setTypingUsers(prev => ({
          ...prev,
          [userId]: isTyping ? username : null
        }));
      });

      const loadChatHistory = async () => {
        try {
          const response = await axios.get(`http://localhost:5000/messages/${user.userId}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
          });
          
          const history = {};
          const uniqueUsers = new Set();
          
          response.data.forEach(msg => {
            const otherUser = msg.sender === user.userId ? msg.receiver : msg.sender;
            if (!history[otherUser]) {
              history[otherUser] = [];
            }
            history[otherUser].push({
              message: msg.content,
              from: msg.sender,
              timestamp: msg.timestamp,
              type: msg.type,
              image: msg.imageUrl
            });
            uniqueUsers.add(otherUser);
          });
          
          setMessages(history);

          const usersResponse = await axios.get(`http://localhost:5000/auth/users`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
          });
          
          const chatUsers = usersResponse.data
            .filter(u => uniqueUsers.has(u._id))
            .map(u => ({
              userId: u._id,
              username: u.username,
              isOnline: onlineUsers.some(online => online.userId === u._id)
            }));
          
          setAllUsers(prevUsers => {
            const newUsers = [...chatUsers];
            prevUsers.forEach(prevUser => {
              const existingUser = newUsers.find(u => u.userId === prevUser.userId);
              if (existingUser) {
                existingUser.isOnline = prevUser.isOnline;
              }
            });
            return newUsers;
          });
        } catch (error) {
          console.error('Error loading chat history:', error);
        }
      };
      loadChatHistory();

      return () => {
        socket.off('users_status');
      };
    }
  }, [socket, user, selectedUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedUser]);

  const handleLogout = () => {
    if (socket) {
      socket.disconnect();
    }
    logout();
    navigate('/login');
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
    } else {
      alert('Please select an image file');
    }
  };

  const cancelImageUpload = () => {
    setSelectedFile(null);
    setImagePreview(null);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if ((!message.trim() && !selectedFile) || !selectedUser) return;

    let messageData = {
      to: selectedUser.userId,
      from: user.userId,
      type: selectedFile ? 'image' : 'text',
      timestamp: new Date()
    };

    if (selectedFile) {
      const formData = new FormData();
      formData.append('image', selectedFile);
      
      try {
        const response = await axios.post('http://localhost:5000/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        messageData.type = 'image';
        messageData.image = response.data.imageUrl;
      } catch (error) {
        console.error('Error uploading image:', error);
        return;
      }
    } else {
      messageData.type = 'text';
      messageData.message = message.trim();
    }

    setMessages(prev => ({
      ...prev,
      [selectedUser.userId]: [...(prev[selectedUser.userId] || []), messageData]
    }));

    socket.emit('send_message', messageData);
    setMessage('');
    setSelectedFile(null);
    setImagePreview(null);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      socket.emit('typing', {
        to: selectedUser.userId,
        from: user.userId,
        username: user.username,
        isTyping: false
      });
    }
  };

  const handleTyping = (e) => {
    setMessage(e.target.value);
    
    if (selectedUser) {
      if (!isTyping) {
        setIsTyping(true);
        socket.emit('typing', {
          to: selectedUser.userId,
          from: user.userId,
          username: user.username,
          isTyping: true
        });
      }
      
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        socket.emit('typing', {
          to: selectedUser.userId,
          from: user.userId,
          username: user.username,
          isTyping: false
        });
      }, 2000);
    }
  };

  const currentMessages = selectedUser ? (messages[selectedUser.userId] || []) : [];

  return (
    <div className="chat-container">
      <div className="chat-sidebar">
        <div className="user-info">
          <h3>Welcome, {user.username}</h3>
          <button onClick={handleLogout}>Logout</button>
        </div>
        <div className="online-users">
          <h4>Chats</h4>
          <ul>
            {allUsers.map((chatUser) => (
              <li
                key={chatUser.userId}
                className={`user-item ${selectedUser?.userId === chatUser.userId ? 'selected' : ''}`}
                onClick={() => setSelectedUser(chatUser)}
              >
                <span className="username">{chatUser.username}</span>
                <span className={`status-indicator ${chatUser.isOnline ? 'online' : 'offline'}`}>
                  {chatUser.isOnline ? 'online' : 'offline'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      
      <div className="chat-main">
        {selectedUser ? (
          <>
            <div className="chat-header">
              <h4>Chatting with {selectedUser.username}</h4>
            </div>
            <div className="messages-container">
              {currentMessages.map((msg, index) => (
                <div
                  key={index}
                  className={`message ${msg.from === user.userId ? 'sent' : 'received'}`}
                >
                  {msg.type === 'image' ? (
                    <img src={msg.image} alt="Shared" className="message-image" />
                  ) : (
                    <p>{msg.message}</p>
                  )}
                  <div className="message-footer">
                    <span className="timestamp">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
              {typingUsers[selectedUser.userId] && (
                <div className="typing-indicator">
                  {typingUsers[selectedUser.userId]} is typing...
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <form onSubmit={sendMessage} className="message-form">
              {imagePreview && (
                <div className="image-preview-container">
                  <img src={imagePreview} alt="Preview" className="image-preview" />
                  <button type="button" onClick={cancelImageUpload} className="cancel-upload">
                    ✕
                  </button>
                </div>
              )}
              <div className="input-container">
                <input
                  type="text"
                  value={message}
                  onChange={handleTyping}
                  placeholder="Type a message..."
                />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                  id="image-upload"
                />
                <label htmlFor="image-upload" className="upload-button">
                  📎
                </label>
                <button type="submit">Send</button>
              </div>
            </form>
          </>
        ) : (
          <div className="no-chat-selected">
            Select a user to start chatting
          </div>
        )}
      </div>
    </div>
  );
}

export default Chat; 