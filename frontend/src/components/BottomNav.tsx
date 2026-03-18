import { useLocation, useNavigate } from 'react-router-dom';
import { Newspaper, Layers2, Flame, Settings } from 'lucide-react';
import { motion } from 'framer-motion';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Feed', path: '/', icon: <Newspaper className="w-6 h-6" /> },
  { label: 'Queue', path: '/queue', icon: <Layers2 className="w-6 h-6" /> },
  { label: 'Trending', path: '/trending', icon: <Flame className="w-6 h-6" /> },
  { label: 'Settings', path: '/settings', icon: <Settings className="w-6 h-6" /> },
];

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-noir-surface/80 backdrop-blur-xl border-t border-noir-border z-40 safe-area-bottom">
      <div className="flex justify-around h-20 px-2">
        {NAV_ITEMS.map((item, index) => {
          const isActive = location.pathname === item.path;
          return (
            <motion.button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="flex-1 flex flex-col items-center justify-center gap-2 transition-all duration-200 min-h-[44px] relative group"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {/* Icon */}
              <motion.div
                className={`flex items-center justify-center transition-all duration-200 ${
                  isActive ? 'text-accent-primary' : 'text-text-secondary group-hover:text-text-primary'
                }`}
                animate={{ scale: isActive ? 1.1 : 1 }}
              >
                {item.icon}
              </motion.div>

              {/* Label - hidden by default, shown on hover for mobile */}
              <span className="text-xs font-semibold tracking-wide uppercase opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                {item.label}
              </span>

              {/* Active indicator dot */}
              {isActive && (
                <motion.div
                  layoutId="nav-dot"
                  className="absolute -top-1 w-1.5 h-1.5 bg-accent-primary rounded-full"
                  transition={{ duration: 0.3, type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}
