import React, { useEffect, useRef, useState } from 'react';
import { X, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { IIITTCrest } from './IIITTCrest';
import { User } from '../types';
import { signInWithGoogleCredential } from '../utils/authSession';

interface GoogleOAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: User) => void;
}

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleAccountsId {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    hd?: string;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }) => void;
  renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    const script = existing ?? document.createElement('script');
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('Could not load Google Sign-In. Check your connection.')), { once: true });
    if (!existing) {
      script.src = GSI_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
}

export const GoogleOAuthModal: React.FC<GoogleOAuthModalProps> = ({ isOpen, onClose, onLoginSuccess }) => {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [scriptReady, setScriptReady] = useState(false);
  const callbacks = useRef({ onLoginSuccess, onClose });
  callbacks.current = { onLoginSuccess, onClose };

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');
    if (!CLIENT_ID) {
      setErrorMsg('Sign-in is not configured: VITE_GOOGLE_CLIENT_ID is missing from the frontend environment.');
      return;
    }
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          hd: 'iiitt.ac.in', // UI hint only; the server enforces the domain
          cancel_on_tap_outside: true,
          callback: async (response) => {
            if (!response.credential) {
              setErrorMsg('Google did not return a credential. Please try again.');
              return;
            }
            setIsLoading(true);
            setErrorMsg('');
            try {
              const user = await signInWithGoogleCredential(response.credential);
              callbacks.current.onLoginSuccess(user);
              callbacks.current.onClose();
            } catch (err: unknown) {
              setErrorMsg(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
            } finally {
              setIsLoading(false);
            }
          },
        });
        setScriptReady(true);
      })
      .catch((err: Error) => !cancelled && setErrorMsg(err.message));
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && scriptReady && buttonRef.current && window.google) {
      buttonRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(buttonRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'pill',
        width: 300,
      });
    }
  }, [isOpen, scriptReady]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-[#0A192F] p-6 text-white text-center relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-300 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex justify-center mb-3">
            <IIITTCrest size={46} />
          </div>
          <h2 className="text-xl font-bold tracking-tight">Sign in with your institute account</h2>
          <p className="text-xs text-amber-300/90 mt-1 font-medium">
            Indian Institute of Information Technology Tiruchirappalli
          </p>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-start gap-3 p-3 bg-amber-50/90 rounded-xl border border-amber-200 text-xs text-amber-950">
            <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              Only <code className="font-mono font-bold bg-amber-100 text-amber-900 px-1 py-0.5 rounded">@iiitt.ac.in</code>{' '}
              Google accounts are accepted. Your identity is verified by Google and the OpenEar server; roles are assigned
              by the server from the official registry.
            </div>
          </div>

          <div className="flex justify-center min-h-[44px] items-center">
            {isLoading ? (
              <span className="flex items-center gap-2 text-sm text-slate-600">
                <Loader2 className="w-4 h-4 animate-spin" /> Verifying with Google and OpenEar…
              </span>
            ) : (
              <div ref={buttonRef} />
            )}
          </div>

          {errorMsg && (
            <div role="alert" className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
