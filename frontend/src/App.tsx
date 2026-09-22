import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { ChatProvider } from '@/contexts/ChatContext';
import Layout from '@/components/Layout';
import Login from '@/pages/Login';
import Chat from '@/pages/Chat';
import Models from '@/pages/Models';
import Files from '@/pages/Files';
import Voice from '@/pages/Voice';
import Projects from '@/pages/Projects';
import Analytics from '@/pages/Analytics';
import Settings from '@/pages/Settings';
import AdminDashboard from '@/pages/AdminDashboard';
import ProtectedRoute from '@/components/ProtectedRoute';
import './App.css';

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="drs-theme">
      <AuthProvider>
        <ChatProvider>
          <Router>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }>
                <Route index element={<Navigate to="/chat" replace />} />
                <Route path="chat" element={<Chat />} />
                <Route path="projects" element={<Projects />} />
                <Route path="files" element={<Files />} />
                <Route path="voice" element={<Voice />} />
                <Route path="models" element={<Models />} />
                <Route path="analytics" element={<Analytics />} />
                <Route path="settings" element={<Settings />} />
                <Route path="admin" element={<AdminDashboard />} />
              </Route>
            </Routes>
          </Router>
          <Toaster />
        </ChatProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
