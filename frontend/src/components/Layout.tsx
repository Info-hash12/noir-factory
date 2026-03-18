import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { CompanySwitcher } from './CompanySwitcher';
import { useAuthStore } from '../store/authStore';
import { LogOut, User } from 'lucide-react';
import { useState } from 'react';

export function Layout() {
  const { user, logout } = useAuthStore();
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-gray-900 border-b border-gray-800 safe-area-top">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center font-bold text-white">
              N
            </div>
            <span className="font-bold text-lg">Noir</span>
          </div>

          <CompanySwitcher />

          <div className="relative ml-4">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-gray-700 transition-colors min-h-[44px] min-w-[44px]"
            >
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.name || 'User'}
                  className="w-full h-full rounded-full"
                />
              ) : (
                <User className="w-5 h-5 text-gray-400" />
              )}
            </button>

            {showMenu && (
              <div className="absolute top-full right-0 mt-2 w-48 bg-gray-900 border border-gray-800 rounded-lg shadow-xl">
                <div className="px-4 py-3 border-b border-gray-800">
                  <p className="text-sm font-medium">{user?.name || user?.email}</p>
                  <p className="text-xs text-gray-500">{user?.email}</p>
                </div>
                <button
                  onClick={async () => {
                    await logout();
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-4 py-3 text-red-400 hover:bg-gray-800 transition-colors flex items-center gap-2 min-h-[44px]"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-24 max-w-md mx-auto w-full">
        <Outlet />
      </main>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
