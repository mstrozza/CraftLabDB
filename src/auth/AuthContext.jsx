import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

const AuthContext = createContext(null);
const DEMO_USER_KEY = 'db-docgen-demo-user';
const PASSWORD_FLOWS = ['setup', 'recovery'];
const authRootUrl = () => new URL(import.meta.env.BASE_URL, window.location.origin);

const readPasswordFlow = () => {
  const flow = new URL(window.location.href).searchParams.get('auth');
  return PASSWORD_FLOWS.includes(flow) ? flow : null;
};

const authRedirectUrl = (flow) => {
  const url = authRootUrl();
  url.searchParams.set('auth', flow);
  return url.toString();
};

const clearPasswordFlowUrl = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete('auth');
  url.searchParams.delete('code');
  if (url.hash.includes('access_token=') || url.hash.includes('error=')) url.hash = '';
  window.history.replaceState(window.history.state, '', url);
};

const readDemoUser = () => {
  if (isSupabaseConfigured) return null;
  try {
    const stored = window.localStorage.getItem(DEMO_USER_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

export function AuthProvider({ children }) {
  const [demoUser, setDemoUser] = useState(readDemoUser);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileStatus, setProfileStatus] = useState(isSupabaseConfigured ? 'loading' : 'ready');
  const profileLoadId = useRef(0);
  const [status, setStatus] = useState(() => {
    if (isSupabaseConfigured) return 'loading';
    return readDemoUser() ? 'authenticated' : 'anonymous';
  });
  const [error, setError] = useState(null);
  const [passwordFlow, setPasswordFlow] = useState(readPasswordFlow);
  const clearAuthError = useCallback(() => setError(null), []);

  const loadProfile = useCallback(async (userId) => {
    const loadId = ++profileLoadId.current;
    setProfileStatus('loading');
    if (!supabase || !userId) {
      setProfile(null);
      setProfileStatus('ready');
      return null;
    }
    try {
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('id, display_name, email, role, is_active, created_at, updated_at')
        .eq('id', userId)
        .maybeSingle();
      if (profileError) throw profileError;
      if (loadId === profileLoadId.current) {
        setProfile(data);
        setProfileStatus('ready');
      }
      return data;
    } catch (profileError) {
      if (loadId === profileLoadId.current) setProfileStatus('error');
      throw profileError;
    }
  }, []);

  useEffect(() => {
    if (!supabase) return undefined;

    let active = true;
    const initialise = async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!active) return;
        setSession(data.session);
        if (data.session?.user) await loadProfile(data.session.user.id);
        else setProfileStatus('ready');
        if (active) setStatus(data.session ? 'authenticated' : 'anonymous');
      } catch (initialisationError) {
        if (!active) return;
        setError(initialisationError);
        setStatus('error');
      }
    };

    initialise();

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setError(null);
      setStatus(nextSession ? 'authenticated' : 'anonymous');
      profileLoadId.current += 1;
      setProfile(null);
      setProfileStatus(nextSession ? 'loading' : 'ready');
      if (event === 'PASSWORD_RECOVERY') setPasswordFlow('recovery');
      window.setTimeout(() => {
        if (!active) return;
        if (nextSession?.user) {
          loadProfile(nextSession.user.id).catch((profileError) => setError(profileError));
        }
      }, 0);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signInDemo = useCallback(({ name, email }) => {
    if (isSupabaseConfigured) throw new Error('El acceso local no está disponible con Supabase configurado.');
    const nextUser = {
      id: 'demo-local-user',
      email: email.trim(),
      app_metadata: { provider: 'demo' },
      user_metadata: { full_name: name.trim(), name: name.trim() },
    };
    window.localStorage.setItem(DEMO_USER_KEY, JSON.stringify(nextUser));
    setDemoUser(nextUser);
    setError(null);
    setStatus('authenticated');
    return nextUser;
  }, []);

  const signInWithProvider = useCallback(async (provider) => {
    if (!supabase) throw new Error('Configura Supabase para habilitar el acceso.');
    setError(null);
    const options = { redirectTo: authRootUrl().toString() };
    const { error: signInError } = await supabase.auth.signInWithOAuth({ provider, options });
    if (signInError) {
      setError(signInError);
      throw signInError;
    }
  }, []);

  const requestAccess = useCallback(async (email) => {
    if (!supabase) throw new Error('Configura Supabase para solicitar acceso.');
    setError(null);
    const { error: requestError } = await supabase.functions.invoke('request-access', {
      body: { email: email.trim() },
    });
    if (requestError) throw requestError;
  }, []);

  const listAccessRequests = useCallback(async () => {
    if (!supabase || profile?.role !== 'admin' || !profile.is_active) throw new Error('Permiso insuficiente.');
    const { data, error: listError } = await supabase.from('access_requests')
      .select('id, email, status, requested_at, updated_at, reviewed_at, processing_started_at, attempts, error')
      .order('requested_at', { ascending: false });
    if (listError) throw listError;
    return data ?? [];
  }, [profile]);

  const reviewAccessRequest = useCallback(async (id, action) => {
    if (!supabase || profile?.role !== 'admin' || !profile.is_active) throw new Error('Permiso insuficiente.');
    const { data, error: reviewError } = await supabase.functions.invoke('review-access-request', {
      body: { id, action },
    });
    if (reviewError) throw reviewError;
    return data;
  }, [profile]);

  const signInWithPassword = useCallback(async (email, password) => {
    if (!supabase) throw new Error('Configura Supabase para habilitar el acceso por correo.');
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) throw signInError;
  }, []);

  const sendPasswordRecovery = useCallback(async (email) => {
    if (!supabase) throw new Error('Configura Supabase para habilitar la recuperación.');
    setError(null);
    const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: authRedirectUrl('recovery'),
    });
    if (recoveryError) throw recoveryError;
  }, []);

  const setPassword = useCallback(async (password) => {
    if (!supabase) throw new Error('Configura Supabase para habilitar el acceso.');
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) throw updateError;
    clearPasswordFlowUrl();
    setPasswordFlow(null);
    setError(null);
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) {
      window.localStorage.removeItem(DEMO_USER_KEY);
      setDemoUser(null);
      setProfile(null);
      setStatus('anonymous');
      return;
    }
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
    clearPasswordFlowUrl();
    setPasswordFlow(null);
  }, []);

  const effectiveProfile = profile ?? (demoUser ? {
    id: demoUser.id,
    display_name: demoUser.user_metadata.full_name,
    email: demoUser.email,
    role: 'editor',
    is_active: true,
  } : null);

  const value = useMemo(() => ({
    configured: isSupabaseConfigured,
    status,
    session,
    user: session?.user ?? demoUser ?? null,
    profile: effectiveProfile,
    profileStatus,
    error,
    clearAuthError,
    passwordFlow,
    isAuthenticated: status === 'authenticated',
    isActive: effectiveProfile?.is_active ?? false,
    isDemo: Boolean(demoUser),
    role: effectiveProfile?.role ?? null,
    refreshProfile: () => (demoUser ? Promise.resolve(effectiveProfile) : loadProfile(session?.user?.id)),
    signInDemo,
    requestAccess,
    listAccessRequests,
    reviewAccessRequest,
    signInWithPassword,
    signInWithProvider,
    sendPasswordRecovery,
    setPassword,
    signOut,
  }), [clearAuthError, demoUser, effectiveProfile, error, listAccessRequests, loadProfile, passwordFlow, profileStatus, requestAccess, reviewAccessRequest, session, sendPasswordRecovery, setPassword, signInDemo, signInWithPassword, signInWithProvider, signOut, status]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe utilizarse dentro de AuthProvider');
  return context;
}
