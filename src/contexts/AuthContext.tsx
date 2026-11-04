import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseClient, isSupabaseAuthConfigured } from "@/lib/supabase";
import {
  completePortalOAuthRedirect,
  isPendingPortalEnrollment,
  PORTAL_HOME_PATH,
  PORTAL_LOGIN_PATH,
  shouldCompletePortalOAuthRedirect,
  storePortalOAuthReturn,
} from "@/lib/portal-auth";

const ALLOWED_EMAIL_DOMAIN = "thepncl.com";
export const AUTH_STARTUP_TIMEOUT_MS = 12_000;
const AUTH_UNAVAILABLE = "PNCL Hub is taking too long to connect. Please try again shortly.";
const loadSession = () => getSupabaseClient().auth.getSession();

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authError: string | null;
  retryAuth: () => void;
  signInWithGoogle: (redirectPath?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isAllowedEmail(email: string | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseAuthConfigured());
  const [authError, setAuthError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const sessionRequest = useRef<ReturnType<typeof loadSession> | null>(null);
  const retryAuth = useCallback(() => setAttempt(value => value + 1), []);

  const maybeRedirectAfterPortalSignIn = useCallback(() => {
    if (!user || !isEmailConfirmed(user)) return;
    if (!shouldCompletePortalOAuthRedirect(window.location.pathname)) return;
    completePortalOAuthRedirect({
      pendingEnrollment: isPendingPortalEnrollment(user.app_metadata),
    });
  }, [user]);

  useEffect(() => {
    maybeRedirectAfterPortalSignIn();
  }, [maybeRedirectAfterPortalSignIn, loading]);

  useEffect(() => {
    if (!isSupabaseAuthConfigured()) {
      setLoading(false);
      return;
    }

    const supabase = getSupabaseClient();
    let active = true;
    let eventVersion = 0;
    let signOutTimer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    setAuthError(null);
    const fail = () => {
      if (!active) return;
      setAuthError(AUTH_UNAVAILABLE);
      setLoading(false);
    };
    const timer = setTimeout(fail, AUTH_STARTUP_TIMEOUT_MS);
    const applySession = (nextSession: Session | null) => {
      const allowed = !nextSession?.user || isAllowedEmail(nextSession.user.email);
      setSession(allowed ? nextSession : null);
      setUser(allowed ? nextSession?.user ?? null : null);
      if (!allowed) {
        const version = eventVersion;
        // Auth callbacks execute under the SDK's session lock. Signing out
        // inside that callback can deadlock every subsequent auth request.
        signOutTimer = setTimeout(() => {
          if (active && version === eventVersion) void supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        }, 0);
      }
    };
    const finish = () => {
      clearTimeout(timer);
      setAuthError(null);
      setLoading(false);
    };

    // Reuse a pending session read on retry instead of queuing more requests
    // behind a stalled refresh. A late success can still recover the screen.
    if (!sessionRequest.current) {
      const request = loadSession();
      sessionRequest.current = request;
      const clearRequest = () => { if (sessionRequest.current === request) sessionRequest.current = null; };
      void request.then(clearRequest, clearRequest);
    }
    const version = eventVersion;
    void sessionRequest.current.then(({ data, error }) => {
      if (!active || version !== eventVersion) return;
      if (error) { clearTimeout(timer); fail(); return; }
      applySession(data.session);
      finish();
    }, () => { if (active && version === eventVersion) { clearTimeout(timer); fail(); } });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      // A null INITIAL_SESSION can also follow a failed refresh. Let the
      // session result distinguish an outage from an actual signed-out user.
      if (event === "INITIAL_SESSION" && !nextSession) return;
      eventVersion++;
      applySession(nextSession);
      finish();
    });

    return () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(signOutTimer);
      subscription.unsubscribe();
    };
  }, [attempt]);

  const signInWithGoogle = useCallback(async (redirectPath = PORTAL_HOME_PATH) => {
    const supabase = getSupabaseClient();
    const path = redirectPath.startsWith("/") ? redirectPath : `/${redirectPath}`;
    storePortalOAuthReturn(path);
    const redirectTo = `${window.location.origin}${PORTAL_LOGIN_PATH}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          hd: ALLOWED_EMAIL_DOMAIN,
          prompt: "select_account",
        },
      },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, session, loading, authError, retryAuth, signInWithGoogle, signOut }),
    [user, session, loading, authError, retryAuth, signInWithGoogle, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

export function isEmailConfirmed(user: User | null): boolean {
  return Boolean(user?.email_confirmed_at);
}

export function mustChangePassword(user: User | null): boolean {
  return user?.user_metadata?.must_change_password === true;
}
