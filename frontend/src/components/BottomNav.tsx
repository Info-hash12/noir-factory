import { useLocation, useNavigate } from 'react-router-dom';
import { Home, ListTodo, Zap, Settings } from 'lucide-react';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Feed', path: '/', icon: <Home className="w-6 h-6" /> },
  { label: 'Queue', path: '/queue', icon: <ListTodo className="w-6 h-6" /> },
  { label: 'Bot', path: '/bot', icon: <Zap className="w-6 h-6" /> },
  { label: 'Settings', path: '/settings', icon: <Settings className="w-6 h-6" /> },
];

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 z-40 safe-area-bottom">
      <div className="flex justify-around h-20">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors min-h-[44px] ${
                isActive
                  ? 'text-blue-500 bg-blue-500 bg-opacity-10'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              {item.icon}
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
