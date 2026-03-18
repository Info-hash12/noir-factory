import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { motion } from 'framer-motion';

export function LoginPage() {
  const navigate = useNavigate();
  const { user, initialize, login, error } = useAuthStore();
  const [password, setPassword] = useState('');
  const [shake, setShake] = useState(false);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const success = login(password);
    if (!success) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen bg-noir-bg relative overflow-hidden flex flex-col items-center justify-center px-4">
      {/* Animated gradient orbs */}
      <motion.div
        className="absolute top-20 right-10 w-72 h-72 bg-accent-primary rounded-full mix-blend-multiply filter blur-3xl opacity-20 pointer-events-none"
        animate={{ x: [0, 100, 0], y: [0, -100, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-8 -left-8 w-72 h-72 bg-accent-danger rounded-full mix-blend-multiply filter blur-3xl opacity-10 pointer-events-none"
        animate={{ x: [0, -100, 0], y: [0, 100, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="w-full max-w-md space-y-8 relative z-10">
        {/* Logo */}
        <motion.div
          className="flex flex-col items-center gap-6"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <motion.div
            className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent-primary to-accent-danger flex items-center justify-center shadow-2xl"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <span className="text-4xl font-black text-noir-bg">✦</span>
          </motion.div>

          <div className="text-center">
            <h1 className="text-5xl font-black tracking-tight text-text-primary mb-2">
              NOIR FACTORY
            </h1>
            <p className="text-lg font-semibold tracking-wide text-accent-primary uppercase">
              Content Production Engine
            </p>
          </div>
        </motion.div>

        {/* Password Form */}
        <motion.form
          onSubmit={handleSubmit}
          className="space-y-4"
          animate={shake ? { x: [-12, 12, -8, 8, -4, 4, 0] } : {}}
          transition={{ duration: 0.4 }}
        >
          <div className="relative">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoFocus
              className="w-full h-14 rounded-xl bg-noir-card border border-noir-border px-5 text-text-primary text-base placeholder:text-text-muted focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/50 transition-all duration-200"
            />
            {error && (
              <motion.p
                className="absolute -bottom-6 left-1 text-sm text-accent-danger"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                {error}
              </motion.p>
            )}
          </div>

          <motion.button
            type="submit"
            disabled={!password}
            className="w-full h-14 rounded-xl bg-gradient-to-r from-accent-primary to-purple-500 text-white font-semibold text-base flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-accent-primary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Unlock
          </motion.button>
        </motion.form>

        <motion.p
          className="text-center text-xs text-text-muted"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
        >
          Authorized access only
        </motion.p>
      </div>
    </div>
  );
}
