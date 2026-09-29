import { useEffect, useState, useRef } from "react";
import { Globe, Loader2 } from "lucide-react";

declare global {
  interface Window {
    googleTranslateElementInit?: () => void;
    google?: {
      translate?: {
        TranslateElement?: new (
          options: { pageLanguage: string; includedLanguages: string; autoDisplay: boolean },
          elementId: string,
        ) => object;
      };
    };
  }
}

export function GoogleTranslate() {
  const [lang, setLang] = useState("en");
  const [isTranslating, setIsTranslating] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to read cookie
  const getCookie = (name: string) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(";").shift();
    return undefined;
  };

  // Helper to set googtrans cookie across root path and domain variants
  const setGoogTransCookie = (targetLang: string) => {
    const cookieVal = targetLang === "en" ? "/en/en" : `/en/${targetLang}`;
    const hostname = window.location.hostname;

    // Set for current path & root
    document.cookie = `googtrans=${cookieVal}; path=/;`;
    document.cookie = `googtrans=${cookieVal}; path=/; domain=${hostname};`;

    const parts = hostname.split(".");
    if (parts.length > 2) {
      const rootDomain = parts.slice(-2).join(".");
      document.cookie = `googtrans=${cookieVal}; path=/; domain=.${rootDomain};`;
    }

    if (targetLang === "en") {
      const expire = "expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      document.cookie = `googtrans=; ${expire}`;
      document.cookie = `googtrans=; ${expire} domain=${hostname};`;
      if (parts.length > 2) {
        const rootDomain = parts.slice(-2).join(".");
        document.cookie = `googtrans=; ${expire} domain=.${rootDomain};`;
      }
    }
  };

  // Read initial language from Google Translate cookie if it exists
  useEffect(() => {
    const googtrans = getCookie("googtrans");
    if (googtrans) {
      const langCode = googtrans.split("/").pop();
      if (langCode && langCode !== "en") {
        setLang(langCode);
      } else {
        setLang("en");
      }
    }
  }, []);

  // Initialize Google Translate widget globally
  useEffect(() => {
    let container = document.getElementById("google_translate_element");
    if (!container) {
      container = document.createElement("div");
      container.id = "google_translate_element";
      // Position offscreen so the browser fully evaluates layout and renders options
      container.style.position = "fixed";
      container.style.top = "-9999px";
      container.style.left = "-9999px";
      container.style.width = "1px";
      container.style.height = "1px";
      container.style.opacity = "0";
      container.style.pointerEvents = "none";
      container.style.zIndex = "-1000";
      document.body.appendChild(container);
    }

    const initWidget = () => {
      if (window.google?.translate?.TranslateElement) {
        const el = document.getElementById("google_translate_element");
        if (el && el.children.length === 0) {
          new window.google.translate.TranslateElement(
            {
              pageLanguage: "en",
              includedLanguages: "en,hi,gom,mr,gu,bn,te,ta,kn,ml,pa,ur,or,as",
              autoDisplay: false,
            },
            "google_translate_element",
          );
        }
      }
    };

    window.googleTranslateElementInit = initWidget;

    if (window.google?.translate?.TranslateElement) {
      initWidget();
    } else if (!document.getElementById("google-translate-script")) {
      const script = document.createElement("script");
      script.id = "google-translate-script";
      script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
      script.async = true;
      document.body.appendChild(script);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const triggerTranslation = (targetLang: string) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    setLang(targetLang);
    setGoogTransCookie(targetLang);

    const tryApply = (): boolean => {
      const select = document.querySelector(".goog-te-combo") as HTMLSelectElement | null;
      if (!select || select.options.length === 0) return false;

      const options = Array.from(select.options);
      // For English, Google Translate uses value "" ("Select Language") or "en"
      const matched = options.find((opt) =>
        targetLang === "en" ? opt.value === "" || opt.value === "en" : opt.value === targetLang,
      );

      if (matched) {
        select.value = matched.value;
        select.dispatchEvent(new Event("change"));
        return true;
      }
      return false;
    };

    // If options are already loaded, trigger immediately
    if (tryApply()) {
      setIsTranslating(false);
      return;
    }

    // Otherwise, poll for up to 3.5 seconds while Google Translate fetches options asynchronously
    setIsTranslating(true);
    let attempts = 0;
    pollIntervalRef.current = setInterval(() => {
      attempts++;
      if (tryApply()) {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        setIsTranslating(false);
        return;
      }

      if (attempts >= 35) {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        setIsTranslating(false);
        // Fallback: the googtrans cookie is already set, reload applies the translation on boot
        window.location.reload();
      }
    }, 100);
  };

  return (
    <div className="notranslate relative inline-flex items-center overflow-hidden rounded-full border border-orange-500/30 bg-white/60 px-3 py-1.5 shadow-sm backdrop-blur-md transition-all hover:bg-white/90 hover:shadow-md">
      {isTranslating ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-orange-600" />
      ) : (
        <Globe className="mr-2 h-4 w-4 text-orange-600" />
      )}
      <select
        aria-label="Page language"
        value={lang}
        onChange={(e) => triggerTranslation(e.target.value)}
        className="bg-transparent text-sm font-bold text-orange-700 outline-none cursor-pointer appearance-none pr-4"
      >
        <option value="en">English</option>
        <option value="gom">कोंकणी (Konkani)</option>
        <option value="hi">हिंदी (Hindi)</option>
        <option value="mr">मराठी (Marathi)</option>
        <option value="gu">ગુજરાતી (Gujarati)</option>
        <option value="bn">বাংলা (Bengali)</option>
        <option value="te">తెలుగు (Telugu)</option>
        <option value="ta">தமிழ் (Tamil)</option>
        <option value="kn">ಕನ್ನಡ (Kannada)</option>
        <option value="ml">മലയാളം (Malayalam)</option>
      </select>

      {/* Custom dropdown arrow */}
      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
        <svg
          className="h-3 w-3 text-orange-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Global CSS to hide Google Translate top bar and popups */}
      <style>{`
        body { top: 0 !important; position: static !important; }
        .skiptranslate iframe { display: none !important; }
        #goog-gt-tt { display: none !important; }
        .goog-te-spinner-pos { display: none !important; }
        .goog-te-spinner-animation { display: none !important; }
      `}</style>
    </div>
  );
}
