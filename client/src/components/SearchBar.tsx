import React from 'react';

interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}

export const SearchBar: React.FC<Props> = ({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
}) => {
  return (
    <div className={`relative flex items-center ${className}`}>
      <span className="absolute left-3 text-slate-400 select-none pointer-events-none text-xs">
        🔍
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-8 pr-8 py-2 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl text-xs text-slate-800 placeholder-slate-400 outline-none transition-all shadow-2xs font-medium focus:ring-2 focus:ring-blue-100"
      />
      {value.trim() && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2.5 text-slate-400 hover:text-slate-600 font-bold text-xs p-1 rounded-full hover:bg-slate-200 cursor-pointer transition-colors"
          title="Clear search"
        >
          ✕
        </button>
      )}
    </div>
  );
};

