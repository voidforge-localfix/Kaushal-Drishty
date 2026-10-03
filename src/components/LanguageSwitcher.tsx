import { useState, useRef, useEffect, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages, Check, ChevronDown } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Language definitions                                               */
/* ------------------------------------------------------------------ */

interface LangOption {
  code: string;
  /** Native script label shown inside the switcher */
  native: string;
  /** Latin-script name for accessibility / tooltips */
  label: string;
  /** Short 2-char badge shown in compact mode */
  badge: string;
}

const LANGUAGES: LangOption[] = [
  { code: 'en', native: 'English', label: 'English', badge: 'EN' },
  { code: 'hi', native: 'हिन्दी', label: 'Hindi', badge: 'हिं' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const LanguageSwitcher: FC = () => {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentLang =
    LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0];

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const switchLanguage = (code: string) => {
    i18n.changeLanguage(code);
    setOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* ── Trigger Button ───────────────────────────── */}
      <button
        id="language-switcher"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Current language: ${currentLang.label}. Click to change.`}
        className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-slate-200 transition-all duration-200 hover:bg-white/[0.08] hover:border-white/15"
      >
        <Languages className="h-4 w-4 text-accent-amber" />

        {/* active language badge */}
        <span className="text-accent-amber">{currentLang.badge}</span>
        <span className="text-[10px] text-slate-500">|</span>
        {/* show the OTHER language faded */}
        <span className="text-slate-500">
          {LANGUAGES.find((l) => l.code !== currentLang.code)?.badge}
        </span>

        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* ── Dropdown Panel ───────────────────────────── */}
      {open && (
        <div
          role="listbox"
          aria-label="Select language"
          className="absolute right-0 top-full z-[60] mt-2 w-52 origin-top-right animate-[fadeIn_150ms_ease-out] overflow-hidden rounded-xl border border-white/10 bg-navy-800/98 py-1 shadow-2xl"
        >
          {/* header */}
          <div className="border-b border-white/[0.06] px-4 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              भाषा चुनें / Select Language
            </p>
          </div>

          {/* options */}
          {LANGUAGES.map((lang) => {
            const isActive = lang.code === currentLang.code;
            return (
              <button
                key={lang.code}
                role="option"
                aria-selected={isActive}
                onClick={() => switchLanguage(lang.code)}
                className={`flex w-full items-center justify-between px-4 py-3 text-sm transition-colors duration-150 hover:bg-white/[0.06] ${
                  isActive ? 'text-accent-cyan' : 'text-slate-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* language badge */}
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${
                      isActive
                        ? 'bg-accent-cyan/15 text-accent-cyan'
                        : 'bg-white/[0.04] text-slate-400'
                    }`}
                  >
                    {lang.badge}
                  </span>
                  <div className="text-left">
                    <p className="font-semibold leading-tight">{lang.native}</p>
                    <p className="text-[11px] text-slate-500">{lang.label}</p>
                  </div>
                </div>
                {isActive && (
                  <Check className="h-4 w-4 text-accent-cyan" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LanguageSwitcher;
