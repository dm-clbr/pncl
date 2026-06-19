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

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  resendConfirmationEmail: (email: string) => Promise<void>;
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      enforceDomain(nextSession).catch(() => {
        setSession(null);
        setUser(null);
      });
    });

    return () => subscription.unsubscribe();
  }, [enforceDomain]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const resendConfirmationEmail = useCallback(async (email: string) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/portal`,
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
    () => ({ user, session, loading, signInWithEmail, resendConfirmationEmail, signOut }),
    [user, session, loading, signInWithEmail, resendConfirmationEmail, signOut],
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
