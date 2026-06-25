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

const ALLOWED_EMAIL_DOMAIN = "thepncl.com";
const PORTAL_HOME_PATH = "/portal";

function isOAuthCallbackUrl(): boolean {
  const { hash, search } = window.location;
  return hash.includes("access_token") || search.includes("code=");
}

function clearOAuthCallbackFromUrl() {
  window.history.replaceState(null, "", window.location.pathname);
}

function redirectToPortalAfterOAuth() {
  const { pathname } = window.location;
  if (pathname === "/" || pathname === "") {
    clearOAuthCallbackFromUrl();
    window.location.replace(PORTAL_HOME_PATH);
  }
}

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

  useEffect(() => {
    if (loading || !user || !isEmailConfirmed(user)) return;
    if (!isOAuthCallbackUrl()) return;
    redirectToPortalAfterOAuth();
  }, [loading, user]);

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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      try {
        await enforceDomain(nextSession);
        if (
          (event === "SIGNED_IN" || event === "INITIAL_SESSION")
          && nextSession?.user
          && isOAuthCallbackUrl()
        ) {
          redirectToPortalAfterOAuth();
        }
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
    const redirectTo = `${window.location.origin}${path}`;
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
