import { useState, useRef, useEffect } from 'react';

// Common emoji categories for projects & tables
const EMOJI_GROUPS = [
  {
    label: 'Objects',
    emojis: ['📦', '📋', '📊', '📈', '📉', '📁', '📂', '📝', '📄', '📑', '📌', '📎', '🔖', '📐', '📏', '🗂️', '🗃️', '🗄️', '💼', '🛒'],
  },
  {
    label: 'Symbols',
    emojis: ['⭐', '🔥', '💡', '🎯', '🏷️', '🔔', '🔑', '🔒', '🛡️', '⚡', '💎', '🏆', '🎖️', '🎪', '🎨', '🧩', '♻️', '✅', '❤️', '💰'],
  },
  {
    label: 'People & Work',
    emojis: ['👤', '👥', '🏢', '🏠', '🏗️', '🤝', '💪', '🧑‍💻', '👷', '🧑‍🔬', '🧑‍🎨', '🧑‍💼', '📞', '📧', '💬', '🗓️', '⏰', '🔧', '⚙️', '🛠️'],
  },
  {
    label: 'Nature & Fun',
    emojis: ['🌍', '🌱', '🌿', '🍀', '🌸', '🌻', '🌈', '☀️', '🌙', '⛅', '🐶', '🐱', '🦊', '🐻', '🦁', '🎉', '🎊', '🎵', '🚀', '✨'],
  },
];

type EmojiPickerProps = {
  value: string;
  onChange: (emoji: string) => void;
  size?: 'sm' | 'md' | 'lg';
};

export function EmojiPicker({ value, onChange, size = 'md' }: EmojiPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  const sizeClasses = {
    sm: 'h-7 w-7 text-sm',
    md: 'h-9 w-9 text-lg',
    lg: 'h-11 w-11 text-2xl',
  };

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`${sizeClasses[size]} flex items-center justify-center rounded-lg border border-gray-300 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors`}
        title="Choose icon"
      >
        {value}
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
          {EMOJI_GROUPS.map((group) => (
            <div key={group.label} className="mb-2 last:mb-0">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {group.label}
              </div>
              <div className="flex flex-wrap gap-0.5">
                {group.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onChange(emoji);
                      setIsOpen(false);
                    }}
                    className={`flex h-8 w-8 items-center justify-center rounded-md text-lg hover:bg-blue-50 transition-colors ${
                      value === emoji ? 'bg-blue-100 ring-1 ring-blue-300' : ''
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
