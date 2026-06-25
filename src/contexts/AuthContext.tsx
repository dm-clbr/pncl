import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseClient, isSupabaseAuthConfigured } from "@/lib/supabase";
import {
  completePortalOAuthRedirect,
  PORTAL_HOME_PATH,
  PORTAL_LOGIN_PATH,
  shouldCompletePortalOAuthRedirect,
  storePortalOAuthReturn,
} from "@/lib/portal-auth";

const ALLOWED_EMAIL_DOMAIN = "thepncl.com";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
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

  const enforceDomain = useCallback(async (nextSession: Session | null) => {
    if (!nextSession?.user) {
      setSession(null);
      setUser(null);
      return;
    }

    if (!isAllowedEmail(nextSession.user.email)) {
      const supabase = getSupabaseClient();
      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
      throw new Error(`Only @${ALLOWED_EMAIL_DOMAIN} accounts can access the employee portal.`);
    }

    setSession(nextSession);
    setUser(nextSession.user);
  }, []);

  const maybeRedirectAfterPortalSignIn = useCallback(() => {
    if (!user || !isEmailConfirmed(user)) return;
    if (!shouldCompletePortalOAuthRedirect(window.location.pathname)) return;
    completePortalOAuthRedirect();
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

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      enforceDomain(initialSession).catch(() => {
        setSession(null);
        setUser(null);
      }).finally(() => setLoading(false));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      try {
        await enforceDomain(nextSession);
      } catch {
        setSession(null);
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [enforceDomain]);

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
    () => ({ user, session, loading, signInWithGoogle, signOut }),
    [user, session, loading, signInWithGoogle, signOut],
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
