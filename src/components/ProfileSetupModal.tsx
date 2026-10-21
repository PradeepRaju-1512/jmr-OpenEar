import React, { useState } from 'react';
import { UserCheck, Loader2, AlertCircle } from 'lucide-react';
import { User } from '../types';
import { submitGender } from '../utils/authSession';

interface ProfileSetupModalProps {
  onCompleted: (user: User) => void;
  onSignOut: () => void;
}

/**
 * One-time self-declaration needed so boys' / girls' hostel and sports grievances reach the right
 * secretary. Google does not supply gender, so the student states it once; only an administrator
 * can change it afterwards.
 */
export const ProfileSetupModal: React.FC<ProfileSetupModalProps> = ({ onCompleted, onSignOut }) => {
  const [choice, setChoice] = useState<'M' | 'F' | 'O' | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!choice) return;
    setBusy(true);
    setError('');
    try {
      onCompleted(await submitGender(choice));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save your profile.');
    } finally {
      setBusy(false);
    }
  };

  const options: { value: 'M' | 'F' | 'O'; label: string }[] = [
    { value: 'M', label: 'Male' },
    { value: 'F', label: 'Female' },
    { value: 'O', label: 'Other' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-2 text-[#0A192F]">
          <UserCheck className="w-5 h-5 text-[#D97706]" />
          <h2 className="text-lg font-bold">Complete your profile</h2>
        </div>
        <p className="text-sm text-slate-600">
          Boys&apos; and girls&apos; hostel and sports grievances go to different secretaries, so we need to know which
          applies to you. This can only be set once; an administrator can change it later if it was a mistake.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setChoice(o.value)}
              className={`py-2.5 rounded-lg border text-sm font-semibold transition-colors cursor-pointer ${
                choice === o.value
                  ? 'bg-[#0A192F] text-white border-[#0A192F]'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {error && (
          <div role="alert" className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        <div className="flex items-center justify-between pt-1">
          <button type="button" onClick={onSignOut} className="text-xs text-slate-500 hover:underline cursor-pointer">
            Sign out
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!choice || busy}
            className="flex items-center gap-2 px-4 py-2 bg-[#0A192F] text-white text-sm font-bold rounded-lg disabled:opacity-50 cursor-pointer"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Save and continue
          </button>
        </div>
      </div>
    </div>
  );
};
