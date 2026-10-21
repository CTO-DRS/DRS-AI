import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { useAuth } from '@/contexts/AuthContext';
import { useLiveEvents } from '@/hooks/useLiveEvents';

export default function Layout() {
  const { isAuthenticated } = useAuth();
  // Real-time orchestrator events (approvals, team runs, plans) via the
  // gateway WS hub — toasts + DOM re-broadcast for interested pages.
  useLiveEvents(isAuthenticated);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
