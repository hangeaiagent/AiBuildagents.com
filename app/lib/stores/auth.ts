import { createClient } from '@supabase/supabase-js';
import { atom } from 'nanostores';
import type { WritableAtom } from 'nanostores'; // 注意这里的 `type` 关键字
import type { User } from '~/types/user';

// 初始化 Supabase 客户端
const supabase = createClient(
  'https://dcgnmslhhpqfyqlpizrg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjZ25tc2xoaHBxZnlxbHBpenJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQzNzkyMTksImV4cCI6MjA1OTk1NTIxOX0.VDVChzxa55zeK0jC-2aMlSb5B1z4iDHBrlcAEbktszE',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  },
);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const isRetryableError = (error: any): boolean => {
  if (!error) return false;

  if (error.status === 504) return true;

  if (
    error.message?.includes('network') ||
    error.message?.includes('timeout') ||
    error.message?.includes('failed to fetch')
  ) {
    return true;
  }

  return false;
};

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

class AuthStore {
  private state: WritableAtom<AuthState>;
  private subscription: any;

  constructor() {
    this.state = atom<AuthState>({
      user: null,
      isLoading: true,
      isAuthenticated: false,
    });

    this.init();
  }

  getState() {
    return this.state;
  }

  getUser() {
    return this.state.value?.user;
  }

  getIsLoading() {
    return this.state.value?.isLoading;
  }

  getIsAuthenticated() {
    return this.state.value?.isAuthenticated;
  }

  async init() {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        this.updateUserFromSession(session);
      }

      this.state.set({
        user: this.state.value?.user ?? null,
        isLoading: false,
        isAuthenticated: !!this.state.value?.user,
      });

      this.subscription = supabase.auth.onAuthStateChange((_, newSession) => {
        if (newSession) {
          this.updateUserFromSession(newSession);
        } else {
          this.state.set({
            isLoading: !!this.state.value?.isLoading,
            user: null,
            isAuthenticated: false,
          });
        }
        this.state.set({
          user: this.state.value?.user ?? null,
          isAuthenticated: !!this.state.value?.user,
          isLoading: false,
        });
      });
    } catch (e) {
      console.error('初始化失败:', e);
      this.state.set({
        user: this.state.value?.user ?? null,
        isAuthenticated: !!this.state.value?.user,
        isLoading: false,
      });
    }
  }

  private updateUserFromSession(session: any) {
    this.state.set({
      isLoading: !!this.state.value?.isLoading,
      user: {
        id: session.user.id,
        email: session.user.email!,
        name: session.user.user_metadata.name || null,
      },
      isAuthenticated: true,
    });
  }

  async login(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async loginWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    });
    if (error) throw error;
  }

  async register(email: string, password: string, name: string) {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            data: { name },
          },
        });

        if (otpError) {
          if (isRetryableError(otpError)) {
            if (attempt < maxRetries - 1) {
              const backoffTime = Math.pow(2, attempt) * 2000;
              await delay(backoffTime);
              attempt++;
              continue;
            }
            return { error: new Error('网络连接问题，请检查网络后重试') };
          }
          return { error: otpError };
        }

        return { error: null };
      } catch (err) {
        if (isRetryableError(err) && attempt < maxRetries - 1) {
          const backoffTime = Math.pow(2, attempt) * 2000;
          await delay(backoffTime);
          attempt++;
          continue;
        }
        return { error: new Error('注册失败，请稍后再试') };
      }
    }
    return { error: new Error('多次尝试失败') };
  }

  async verifyOtp(email: string, token: string) {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'signup',
    });
    return { error };
  }

  async logout() {
    await supabase.auth.signOut();
    this.state.set({
      isLoading: !!this.state.value?.isLoading,
      user: null,
      isAuthenticated: false,
    });
  }
}

// 创建单例
export const authStore = new AuthStore();
