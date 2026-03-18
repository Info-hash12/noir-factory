import { useState } from 'react';
import { ChevronDown, Building2 } from 'lucide-react';
import { useCompanyStore } from '../store/companyStore';

export function CompanySwitcher() {
  const { companies, currentCompany, setCurrentCompany } = useCompanyStore();
  const [isOpen, setIsOpen] = useState(false);

  if (!currentCompany || companies.length <= 1) {
    return (
      <div className="flex items-center gap-2">
        <Building2 className="w-5 h-5" />
        <span className="text-sm font-medium">{currentCompany?.name || 'Select Company'}</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors min-h-[44px]"
      >
        <Building2 className="w-5 h-5" />
        <span className="text-sm font-medium">{currentCompany.name}</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-48 bg-gray-900 border border-gray-800 rounded-lg shadow-xl z-50">
          {companies.map((company) => (
            <button
              key={company.id}
              onClick={() => {
                setCurrentCompany(company);
                setIsOpen(false);
              }}
              className={`w-full text-left px-4 py-3 border-b border-gray-800 last:border-b-0 transition-colors ${
                currentCompany.id === company.id
                  ? 'bg-blue-500 bg-opacity-20 text-blue-400'
                  : 'hover:bg-gray-800'
              }`}
            >
              <div className="font-medium text-sm">{company.name}</div>
              <div className="text-xs text-gray-400">{company.slug}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
