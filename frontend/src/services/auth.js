// Auth service using Google Identity Services + custom JWT issued by backend

const API_BASE = import.meta.env.VITE_API_URL || '';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// ---- Token storage ----

export function getToken() {
  return localStorage.getItem('access_token');
}

export function setToken(token) {
  localStorage.setItem('access_token', token);
}

export function clearToken() {
  localStorage.removeItem('access_token');
}

// ---- JWT decode (no verify — backend already verified) ----

function decodeJwt(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

export function getStoredUser() {
  const token = getToken();
  if (!token) return null;
  const payload = decodeJwt(token);
  if (!payload) return null;
  if (payload.exp && payload.exp * 1000 < Date.now()) {
    clearToken();
    return null;
  }
  return { id: payload.id, email: payload.email };
}

// ---- Backend auth call ----

async function loginWithGoogleCredential(credential) {
  const res = await fetch(`${API_BASE}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Authentication failed');
  }
  const { token, user } = await res.json();
  setToken(token);
  return { token, user };
}

// ---- Auth state subscribers ----

let _authSubscribers = [];

function notifySubscribers(event, session) {
  _authSubscribers.forEach(fn => fn(event, session));
}

function waitForGsi() {
  return new Promise((resolve) => {
    if (window.google?.accounts?.id) { resolve(); return; }
    const check = setInterval(() => {
      if (window.google?.accounts?.id) { clearInterval(check); resolve(); }
    }, 100);
    setTimeout(() => { clearInterval(check); resolve(); }, 5000);
  });
}

export const authClient = {
  auth: {
    signInWithOAuth: async ({ provider } = {}) => {
      if (provider !== 'google') throw new Error('Only Google OAuth is supported');
      await waitForGsi();
      if (!window.google?.accounts?.id) throw new Error('Google Identity Services not loaded');

      return new Promise((resolve, reject) => {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (response) => {
            try {
              const result = await loginWithGoogleCredential(response.credential);
              const session = { access_token: result.token, user: result.user };
              notifySubscribers('SIGNED_IN', session);
              resolve({ data: session, error: null });
            } catch (err) {
              reject(err);
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        window.google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            reject(new Error('PROMPT_DISMISSED'));
          }
        });
      });
    },

    signOut: async () => {
      clearToken();
      if (window.google?.accounts?.id) window.google.accounts.id.disableAutoSelect();
      notifySubscribers('SIGNED_OUT', null);
      return { error: null };
    },

    getSession: async () => {
      const user = getStoredUser();
      if (!user) return { data: { session: null }, error: null };
      return { data: { session: { access_token: getToken(), user } }, error: null };
    },

    getUser: async () => {
      return { data: { user: getStoredUser() }, error: null };
    },

    onAuthStateChange: (callback) => {
      _authSubscribers.push(callback);
      const user = getStoredUser();
      const token = getToken();
      setTimeout(() => {
        callback('INITIAL_SESSION', user ? { access_token: token, user } : null);
      }, 0);
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              _authSubscribers = _authSubscribers.filter(fn => fn !== callback);
            },
          },
        },
      };
    },
  },
};

export default authClient;
