import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authClient } from '../services/auth';
import { userApi } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (token) => {
    try {
      localStorage.setItem('access_token', token);
      const { data } = await userApi.getMe();
      setProfile(data.data);
    } catch (err) {
      console.error('Profile fetch failed:', err);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = authClient.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        if (session?.user) {
          setUser(session.user);
          await fetchProfile(session.access_token);
        }
        setLoading(false);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        localStorage.removeItem('access_token');
        setLoading(false);
      }
    });

    return () => { mounted = false; subscription.unsubscribe(); };
  }, [fetchProfile]);

  const signOut = async () => {
    await authClient.auth.signOut();
  };

  const refreshProfile = useCallback(async () => {
    const token = localStorage.getItem('access_token');
    if (token) await fetchProfile(token);
  }, [fetchProfile]);

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
