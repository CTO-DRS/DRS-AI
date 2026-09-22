import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, AuthTokens } from '@/types';
import { authService } from '@/services/api';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, twoFactorCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const tokens = localStorage.getItem('tokens');
      if (tokens) {
        try {
          await refreshToken();
          const userData = await authService.getMe();
          setUser(userData);
        } catch (error) {
          localStorage.removeItem('tokens');
        }
      }
      setIsLoading(false);
    };
    initAuth();
  }, []);

  const login = async (email: string, password: string, twoFactorCode?: string) => {
    try {
      const response = await authService.login(email, password, twoFactorCode);
      const { user, tokens } = response.data;
      
      localStorage.setItem('tokens', JSON.stringify(tokens));
      setUser(user);
      toast.success('Welcome back!');
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Login failed');
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
    } finally {
      localStorage.removeItem('tokens');
      setUser(null);
      toast.info('Logged out');
    }
  };

  const refreshToken = async () => {
    const tokensStr = localStorage.getItem('tokens');
    if (!tokensStr) return;
    
    const tokens: AuthTokens = JSON.parse(tokensStr);
    try {
      const response = await authService.refreshToken(tokens.refreshToken);
      localStorage.setItem('tokens', JSON.stringify(response.data.tokens));
    } catch (error) {
      localStorage.removeItem('tokens');
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isLoading,
      login,
      logout,
      refreshToken
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
