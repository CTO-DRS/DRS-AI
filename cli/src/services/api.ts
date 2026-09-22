import axios, { AxiosInstance } from 'axios';
import Conf from 'conf';

const config = new Conf({ projectName: 'drs-cli' });

const GATEWAY_URL = process.env.DRS_GATEWAY_URL || config.get('gatewayUrl') as string || 'http://localhost:3000/api/v1';

export const drsApi: AxiosInstance = axios.create({
  baseURL: GATEWAY_URL,
  timeout: 300000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add auth token to requests
drsApi.interceptors.request.use((config) => {
  const token = new Conf({ projectName: 'drs-cli' }).get('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
drsApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.error('Authentication expired. Please login again.');
      new Conf({ projectName: 'drs-cli' }).delete('token');
    }
    return Promise.reject(error);
  }
);
