// ---------------------------------------------------------------------------
// Auth context — wraps the Supabase session for the app.
//
// Holds { session, initializing } and exposes signIn / signOut. Subscribes to
// Supabase auth state changes and drives token auto-refresh from the app's
// foreground/background lifecycle (the Supabase-recommended pattern for React
// Native). Tokens live only in the SecureStore adapter; nothing is logged.
// ---------------------------------------------------------------------------
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

type AuthContextValue = {
  session: Session | null;
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const autoRefreshing = useRef(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setInitializing(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    // Refresh tokens only while the app is in the foreground.
    function handleAppState(state: AppStateStatus) {
      if (state === "active" && !autoRefreshing.current) {
        autoRefreshing.current = true;
        supabase.auth.startAutoRefresh();
      } else if (state !== "active" && autoRefreshing.current) {
        autoRefreshing.current = false;
        supabase.auth.stopAutoRefresh();
      }
    }
    handleAppState(AppState.currentState);
    const appStateSub = AppState.addEventListener("change", handleAppState);

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      appStateSub.remove();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      initializing,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw new Error(mapAuthError(error.message));
      },
      async signOut() {
        await supabase.auth.signOut();
      },
    }),
    [session, initializing]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Friendly Vietnamese messages for the common Supabase auth failures. */
function mapAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "Email hoặc mật khẩu không đúng.";
  }
  if (m.includes("email not confirmed")) {
    return "Email chưa được xác nhận.";
  }
  if (m.includes("network")) {
    return "Không thể kết nối máy chủ. Kiểm tra mạng và thử lại.";
  }
  return "Đăng nhập thất bại. Vui lòng thử lại.";
}
