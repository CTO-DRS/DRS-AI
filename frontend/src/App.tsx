import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@/components/theme-provider';
import { I18nProvider } from '@/i18n';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { ChatProvider } from '@/contexts/ChatContext';
import Layout from '@/components/Layout';
import Login from '@/pages/Login';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Loader2 } from 'lucide-react';
import './App.css';

// Route-level code splitting: each page loads on demand, keeping the
// initial bundle small (Chat stays eager as the default landing route).
const Chat = lazy(() => import('@/pages/Chat'));
const Agents = lazy(() => import('@/pages/Agents'));
const Knowledge = lazy(() => import('@/pages/Knowledge'));
const Models = lazy(() => import('@/pages/Models'));
const Files = lazy(() => import('@/pages/Files'));
const Voice = lazy(() => import('@/pages/Voice'));
const Projects = lazy(() => import('@/pages/Projects'));
const Analytics = lazy(() => import('@/pages/Analytics'));
const Settings = lazy(() => import('@/pages/Settings'));
const AdminDashboard = lazy(() => import('@/pages/AdminDashboard'));

function PageFallback() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="drs-theme">
      <I18nProvider>
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
                  <Route path="chat" element={
                    <Suspense fallback={<PageFallback />}><Chat /></Suspense>
                  } />
                  <Route path="agents" element={
                    <Suspense fallback={<PageFallback />}><Agents /></Suspense>
                  } />
                  <Route path="knowledge" element={
                    <Suspense fallback={<PageFallback />}><Knowledge /></Suspense>
                  } />
                  <Route path="projects" element={
                    <Suspense fallback={<PageFallback />}><Projects /></Suspense>
                  } />
                  <Route path="files" element={
                    <Suspense fallback={<PageFallback />}><Files /></Suspense>
                  } />
                  <Route path="voice" element={
                    <Suspense fallback={<PageFallback />}><Voice /></Suspense>
                  } />
                  <Route path="models" element={
                    <Suspense fallback={<PageFallback />}><Models /></Suspense>
                  } />
                  <Route path="analytics" element={
                    <Suspense fallback={<PageFallback />}><Analytics /></Suspense>
                  } />
                  <Route path="settings" element={
                    <Suspense fallback={<PageFallback />}><Settings /></Suspense>
                  } />
                  <Route path="admin" element={
                    <Suspense fallback={<PageFallback />}><AdminDashboard /></Suspense>
                  } />
                </Route>
              </Routes>
            </Router>
            <Toaster />
          </ChatProvider>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

export default App;
