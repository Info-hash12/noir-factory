import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

export function LoginPage() {
  const navigate = useNavigate();
  const { user, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center">
            <span className="text-3xl font-bold text-white">N</span>
          </div>
          <h1 className="text-3xl font-bold text-white">Noir Factory</h1>
          <p className="text-gray-400 text-center">
            Content creation automation for social media
          </p>
        </div>

        {/* Auth UI */}
        <div className="bg-gray-900 rounded-2xl p-8 border border-gray-800">
          <Auth
            supabaseClient={supabase}
            appearance={{
              theme: ThemeSupa,
              variables: {
                default: {
                  colors: {
                    brand: '#3b82f6',
                    brandAccent: '#1e40af',
                    brandButtonText: '#fff',
                    defaultButtonBackground: '#1f2937',
                    defaultButtonBorder: '#374151',
                    defaultButtonText: '#d1d5db',
                    inputBackground: '#111111',
                    inputBorder: '#374151',
                    inputBorderHover: '#4b5563',
                    inputBorderFocus: '#3b82f6',
                    inputText: '#ffffff',
                    inputPlaceholder: '#6b7280',
                  },
                },
              },
              style: {
                button: {
                  minHeight: '44px',
                  fontSize: '16px',
                },
                input: {
                  minHeight: '44px',
                  fontSize: '16px',
                },
                label: {
                  fontSize: '14px',
                },
              },
            }}
            providers={['google']}
            redirectTo={`${window.location.origin}/`}
          />
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-500">
          Secure authentication powered by Supabase
        </p>
      </div>
    </div>
  );
}
