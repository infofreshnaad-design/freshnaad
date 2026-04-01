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
      deviceId = crypto.randomUUID();
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
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
