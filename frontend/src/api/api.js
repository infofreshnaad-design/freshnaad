import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 25000 // Extended for Vercel + WhatsApp API delivery
});

// Request interceptor to add the JWT token and Device ID
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    
    // Simple Device ID Generation
    let deviceId = localStorage.getItem('deviceId');
    if (!deviceId) {
      deviceId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
      });
      localStorage.setItem('deviceId', deviceId);
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    if (deviceId) {
      config.headers['x-device-id'] = deviceId;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle token expiration
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Avoid redirecting if already on login page
      if (window.location.pathname !== '/login') {
        console.warn('Unauthorized request detected. Clearing session and redirecting to login...');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        
        // Use replace instead of href to avoid back button issues
        window.location.replace('/login');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
