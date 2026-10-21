import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Send,
  Sparkles,
  Shield,
  Eye,
  EyeOff,
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Camera,
  Upload,
  X,
  Image as ImageIcon,
  AlertCircle,
} from 'lucide-react';
import { Complaint, ComplaintCategory, DomainType, User, MLSuggestion } from '../types';
import { COMPLAINT_CATEGORIES } from '../data/categories';
import { classifyComplaintText } from '../utils/mlClassifier';
import { apiFetch, readApiError } from '../utils/authSession';

interface StudentComplaintFormProps {
  currentUser: User;
  onSubmitComplaint: (created: Complaint[]) => void;
  onCancel?: () => void;
}

interface ImageUploadItem {
  id: string;
  file: File;
  previewUrl: string;
}

const MAX_IMAGES = 5;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_TARGETS = 3;

const DOMAIN_CARDS: { id: DomainType; label: string; desc: string }[] = [
  { id: 'MESS', label: 'Mess', desc: 'Hygiene, food quality, utensils, maintenance' },
  { id: 'HOSTEL_BOYS', label: "Boys' Hostel", desc: 'Wifi, water, cleaning, washrooms, laundry (5d)' },
  { id: 'HOSTEL_GIRLS', label: "Girls' Hostel", desc: 'Wifi, water, cleaning, washrooms, laundry (5d)' },
  { id: 'SPORTS_BOYS', label: "Boys' Sports", desc: 'Indoor & outdoor sports (7d)' },
  { id: 'SPORTS_GIRLS', label: "Girls' Sports", desc: 'Indoor & outdoor sports (7d)' },
  { id: 'OTHERS', label: 'General Secretary', desc: 'Describe the issue in your own words (5d)' },
];

const categoryLabel = (c: ComplaintCategory) => (c.subOption ? `${c.name} - ${c.subOption}` : c.name);

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Fallback for very old browsers; the server only needs a valid UUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const StudentComplaintForm: React.FC<StudentComplaintFormProps> = ({
  currentUser,
  onSubmitComplaint,
  onCancel,
}) => {
  // Only the sections this student is allowed to use (computed by the server).
  const eligible = useMemo(() => new Set(currentUser.eligibleDomains ?? []), [currentUser.eligibleDomains]);
  const domainCards = DOMAIN_CARDS.filter((d) => eligible.has(d.id));

  const [selectedDomain, setSelectedDomain] = useState<DomainType>(domainCards[0]?.id ?? 'MESS');
  const [selectedCategoryName, setSelectedCategoryName] = useState<string>('');
  const [selectedSubOption, setSelectedSubOption] = useState<string>('');
  // Additional secretaries: domain -> chosen category id
  const [extraTargets, setExtraTargets] = useState<Partial<Record<DomainType, string>>>({});
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationCode, setLocationCode] = useState('');
  const [isConfidential, setIsConfidential] = useState(false);
  const [mlSuggestion, setMlSuggestion] = useState<MLSuggestion | null>(null);

  const [images, setImages] = useState<ImageUploadItem[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef<ImageUploadItem[]>([]);
  imagesRef.current = images;

  // One idempotency key per submission attempt: retrying after a failure never creates duplicates.
  const requestIdRef = useRef<string>(newRequestId());

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [savedComplaints, setSavedComplaints] = useState<Complaint[] | null>(null);

  // Release object URLs when leaving the form.
  useEffect(() => {
    return () => imagesRef.current.forEach((img) => URL.revokeObjectURL(img.previewUrl));
  }, []);

  const categoriesInDomain = COMPLAINT_CATEGORIES.filter((c) => c.domain === selectedDomain);

  // Reset the category when the domain changes.
  useEffect(() => {
    const first = COMPLAINT_CATEGORIES.find((c) => c.domain === selectedDomain);
    setSelectedCategoryName(first?.name ?? '');
    setSelectedSubOption(first?.subOption ?? '');
    setExtraTargets((prev) => {
      const next = { ...prev };
      delete next[selectedDomain];
      return next;
    });
  }, [selectedDomain]);

  // Suggest a category from the typed text (plain keyword rules; the student decides).
  useEffect(() => {
    const suggestion = classifyComplaintText(`${title} ${description}`, currentUser.gender ?? null);
    setMlSuggestion(suggestion && eligible.has(suggestion.domain) ? suggestion : null);
  }, [title, description, currentUser.gender, eligible]);

  const activeCategory: ComplaintCategory | undefined =
    categoriesInDomain.find(
      (c) => c.name === selectedCategoryName && (c.subOption ? c.subOption === selectedSubOption : true)
    ) ?? categoriesInDomain[0];

  const slaDays = activeCategory?.slaDays ?? 5;
  const extraCount = Object.keys(extraTargets).length;

  const handleApplyML = () => {
    if (!mlSuggestion) return;
    setSelectedDomain(mlSuggestion.domain);
    // The domain effect resets the category on the next tick; apply the suggestion after it.
    setTimeout(() => {
      setSelectedCategoryName(mlSuggestion.categoryName);
      setSelectedSubOption(mlSuggestion.subOption ?? '');
    }, 0);
  };

  const toggleExtra = (domain: DomainType, checked: boolean) => {
    setExtraTargets((prev) => {
      const next = { ...prev };
      if (!checked) {
        delete next[domain];
      } else if (Object.keys(prev).length < MAX_TARGETS - 1) {
        next[domain] = COMPLAINT_CATEGORIES.find((c) => c.domain === domain)?.id ?? '';
      }
      return next;
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageError(null);
    const selected: File[] = e.target.files ? Array.from(e.target.files) : [];
    if (selected.length === 0) return;

    if (images.length + selected.length > MAX_IMAGES) {
      setImageError(`You can attach at most ${MAX_IMAGES} photos (currently ${images.length}).`);
    } else {
      const accepted: ImageUploadItem[] = [];
      for (const file of selected) {
        if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
          setImageError(`"${file.name}" is not supported. Use JPEG, PNG or WebP.`);
          accepted.forEach((a) => URL.revokeObjectURL(a.previewUrl));
          accepted.length = 0;
          break;
        }
        if (file.size > MAX_FILE_SIZE_BYTES) {
          setImageError(`"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The limit is 5 MB per photo.`);
          accepted.forEach((a) => URL.revokeObjectURL(a.previewUrl));
          accepted.length = 0;
          break;
        }
        accepted.push({
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          file,
          previewUrl: URL.createObjectURL(file),
        });
      }
      if (accepted.length) setImages((prev) => [...prev, ...accepted]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveImage = (id: string) => {
    setImages((prev) => {
      const item = prev.find((img) => img.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((img) => img.id !== id);
    });
  };

  const formatFileSize = (bytes: number): string =>
    bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !activeCategory || !title.trim() || !description.trim()) return;

    setIsSubmitting(true);
    setErrorMessage('');
    setProgressMsg('Registering your grievance…');

    try {
      const categoryIds = [activeCategory.id, ...Object.values(extraTargets).filter(Boolean)] as string[];

      const res = await apiFetch('/api/v1/complaints/', {
        method: 'POST',
        body: JSON.stringify({
          requestId: requestIdRef.current,
          categoryIds,
          title: title.trim(),
          description: description.trim(),
          locationCode: locationCode.trim() || undefined,
          isConfidential,
        }),
      });
      if (!res.ok) throw new Error(await readApiError(res, 'Could not register the grievance'));

      let created: Complaint[] = await res.json();

      if (images.length > 0) {
        // Complaints that already hold photos (from a previous attempt) are skipped, so retries never duplicate evidence.
        const pending = created.filter((c) => !c.attachments || c.attachments.length === 0);
        const failures: string[] = [];
        for (const complaint of pending) {
          setProgressMsg(`Uploading ${images.length} photo(s) for #${complaint.trackingId}…`);
          const body = new FormData();
          images.forEach((img) => body.append('files', img.file));
          const up = await apiFetch(`/api/v1/complaints/${complaint.id}/attachments/`, { method: 'POST', body });
          if (up.ok) {
            const updated: Complaint = await up.json();
            created = created.map((c) => (c.id === updated.id ? updated : c));
          } else {
            failures.push(`#${complaint.trackingId}: ${await readApiError(up, 'upload failed')}`);
          }
        }
        if (failures.length) {
          // The grievance(s) exist; pressing submit again only retries the missing photos.
          throw new Error(
            `Your grievance was registered, but some photos could not be uploaded (${failures.join('; ')}). ` +
              'Press Submit again to retry only the photos.'
          );
        }
      }

      setSavedComplaints(created);
      onSubmitComplaint(created);
    } catch (err: unknown) {
      console.error('Complaint submission error:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Could not submit the grievance. Please try again.');
    } finally {
      setIsSubmitting(false);
      setProgressMsg('');
    }
  };

  const resetForm = () => {
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setImages([]);
    setTitle('');
    setDescription('');
    setLocationCode('');
    setIsConfidential(false);
    setExtraTargets({});
    setSavedComplaints(null);
    requestIdRef.current = newRequestId();
  };

  if (!currentUser.gender) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 max-w-2xl mx-auto text-center text-sm text-slate-600">
        Please complete your profile first so your grievance can be routed to the right secretary.
      </div>
    );
  }

  if (savedComplaints) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-xs max-w-2xl mx-auto text-center space-y-4">
        <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-200">
          <CheckCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">
          Grievance{savedComplaints.length > 1 ? 's' : ''} registered
        </h2>
        <div className="space-y-2 max-w-md mx-auto">
          {savedComplaints.map((c) => (
            <div key={c.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-left text-xs space-y-0.5">
              <div className="font-mono font-bold text-[#0A192F] text-sm">{c.trackingId}</div>
              <div className="text-slate-600">
                {c.categoryName}
                {c.subOption ? ` - ${c.subOption}` : ''} · assigned to{' '}
                <strong>{c.assignedSecretaryName || 'the responsible secretary'}</strong>
              </div>
              <div className="text-slate-500">
                Deadline {new Date(c.deadline).toLocaleDateString()} ({c.slaDaysSnapshot} days)
                {c.attachments && c.attachments.length > 0 && (
                  <span className="inline-flex items-center gap-1 ml-2">
                    <ImageIcon className="w-3 h-3 text-[#D97706]" />
                    {c.attachments.length} photo(s)
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">If a deadline passes, the responsible warden or incharge is emailed automatically.</p>
        <button
          onClick={resetForm}
          className="px-4 py-2 text-xs font-semibold text-white bg-[#0A192F] hover:bg-[#1B3A60] rounded-lg transition-colors cursor-pointer"
        >
          File Another Grievance
        </button>
      </div>
    );
  }

  const uniqueCategoryNames = Array.from(new Set(categoriesInDomain.map((c) => c.name)));
  const subOptionsForCategory = categoriesInDomain
    .filter((c) => c.name === selectedCategoryName && c.subOption)
    .map((c) => c.subOption as string);
  const extraDomainCards = domainCards.filter((d) => d.id !== selectedDomain);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden max-w-3xl mx-auto">
      <div className="bg-[#0A192F] px-6 py-5 text-white flex items-center justify-between border-b border-slate-800">
        <div>
          <h2 className="text-base font-bold text-white">Log Grievance / Complaint</h2>
          <p className="text-xs text-amber-300">OpenEar Student Council Redressal</p>
        </div>
        <div className="flex items-center gap-2 text-xs bg-[#1B3A60] px-3 py-1.5 rounded-lg border border-slate-700">
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-mono font-medium">Deadline: {slaDays} days</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {errorMessage && (
          <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Submission problem</span>
              <span>{errorMessage}</span>
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            1. Select Complaint Section
          </label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
            {domainCards.map((d) => (
              <button
                type="button"
                key={d.id}
                onClick={() => setSelectedDomain(d.id)}
                className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                  selectedDomain === d.id
                    ? 'border-[#0A192F] bg-blue-50/40 ring-1 ring-[#0A192F]'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="text-xs font-bold text-slate-900">{d.label}</div>
                <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{d.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {selectedDomain !== 'OTHERS' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                2. Specific Category
              </label>
              <select
                value={selectedCategoryName}
                onChange={(e) => {
                  setSelectedCategoryName(e.target.value);
                  const sub = categoriesInDomain.find((c) => c.name === e.target.value && c.subOption);
                  setSelectedSubOption(sub?.subOption ?? '');
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0A192F]"
              >
                {uniqueCategoryNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {subOptionsForCategory.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Sport</label>
                <select
                  value={selectedSubOption}
                  onChange={(e) => setSelectedSubOption(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0A192F]"
                >
                  {subOptionsForCategory.map((sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {extraDomainCards.length > 0 && (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
            <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Also send to another secretary (optional, up to {MAX_TARGETS - 1} more)
            </div>
            {extraDomainCards.map((d) => {
              const checked = d.id in extraTargets;
              const options = COMPLAINT_CATEGORIES.filter((c) => c.domain === d.id);
              return (
                <div key={d.id} className="flex flex-wrap items-center gap-3 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer min-w-[10rem]">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && extraCount >= MAX_TARGETS - 1}
                      onChange={(e) => toggleExtra(d.id, e.target.checked)}
                    />
                    <span className="font-semibold text-slate-800">{d.label}</span>
                  </label>
                  {checked && options.length > 1 && (
                    <select
                      value={extraTargets[d.id]}
                      onChange={(e) => setExtraTargets((prev) => ({ ...prev, [d.id]: e.target.value }))}
                      className="px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                    >
                      {options.map((c) => (
                        <option key={c.id} value={c.id}>
                          {categoryLabel(c)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
            <p className="text-[11px] text-slate-500">Each secretary receives their own copy with its own tracking ID and deadline.</p>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Location / Room (optional)
          </label>
          <input
            type="text"
            maxLength={100}
            placeholder="e.g. Mess Hall A Table 14 or Boys Hostel Block B Room 204"
            value={locationCode}
            onChange={(e) => setLocationCode(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0A192F]"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Complaint Subject / Title
          </label>
          <input
            type="text"
            required
            minLength={3}
            maxLength={200}
            placeholder="Brief summary of the grievance…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0A192F]"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              {selectedDomain === 'OTHERS' ? 'Describe the issue' : 'Detailed Description'}
            </label>
            <span className="text-[11px] text-slate-400">{description.length} / 5000</span>
          </div>
          <textarea
            required
            minLength={10}
            maxLength={5000}
            rows={4}
            placeholder="Describe what happened, when, and what you expect to be done…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0A192F]"
          />

          {mlSuggestion && (
            <div className="mt-2.5 p-3 bg-amber-50/80 border border-amber-200 rounded-lg flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center shrink-0 text-amber-700">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-amber-900">
                    Suggested category:{' '}
                    <span className="font-bold">
                      {mlSuggestion.categoryName}
                      {mlSuggestion.subOption ? ` (${mlSuggestion.subOption})` : ''}
                    </span>{' '}
                    in <span className="underline">{mlSuggestion.domain.replace('_', ' ')}</span>
                  </div>
                  <div className="text-[11px] text-amber-700">{mlSuggestion.reason}. Suggestion only, you decide.</div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleApplyML}
                className="px-3 py-1 bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-medium rounded-md whitespace-nowrap transition-colors shrink-0 cursor-pointer"
              >
                Apply
              </button>
            </div>
          )}
        </div>

        <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-[#D97706]" />
                Photos & Evidence (optional)
              </span>
              <p className="text-xs text-slate-500 mt-0.5">
                Up to 5 photos, 5 MB each (JPEG, PNG, WebP). Location and camera details are removed on the server.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500">
              {images.length} / {MAX_IMAGES}
            </span>
          </div>

          {imageError && (
            <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{imageError}</span>
            </div>
          )}

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
          />

          {images.length < MAX_IMAGES && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-slate-300 hover:border-[#0A192F] hover:bg-white/80 transition-all rounded-lg p-5 text-center cursor-pointer space-y-1.5"
            >
              <Upload className="w-6 h-6 text-slate-400 mx-auto" />
              <div className="text-xs font-semibold text-slate-800">Click to choose photos or take one on mobile</div>
            </button>
          )}

          {images.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-2">
              {images.map((img) => (
                <div key={img.id} className="relative bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <img src={img.previewUrl} alt={img.file.name} className="w-full h-24 object-cover" />
                  <div className="p-1.5 bg-white">
                    <div className="text-[10px] font-semibold text-slate-800 truncate" title={img.file.name}>
                      {img.file.name}
                    </div>
                    <div className="text-[9px] font-mono text-slate-400">{formatFileSize(img.file.size)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(img.id)}
                    className="absolute top-1 right-1 p-1 bg-slate-900/80 hover:bg-red-600 text-white rounded-full transition-colors cursor-pointer"
                    title="Remove photo"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${isConfidential ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-600'}`}>
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900">Confidential grievance</span>
                <p className="text-xs text-slate-600 mt-0.5">
                  When on, the server hides your name, roll number and email from student secretaries. Only the
                  responsible warden / incharge and system administrators can see who you are. Do not write identifying
                  details in the description if you want to stay anonymous.
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
              <input
                type="checkbox"
                checked={isConfidential}
                onChange={(e) => setIsConfidential(e.target.checked)}
                className="sr-only peer"
                aria-label="Confidential grievance"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0A192F]"></div>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 text-[11px]">
            <div className="p-2 bg-white rounded border border-slate-200 flex items-center gap-2">
              <EyeOff className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <div>
                <span className="text-slate-500 block">Student secretary sees:</span>
                <span className="font-semibold text-slate-700">
                  {isConfidential ? 'Anonymous Student (Confidential)' : `${currentUser.name} (${currentUser.rollNumber})`}
                </span>
              </div>
            </div>
            <div className="p-2 bg-white rounded border border-slate-200 flex items-center gap-2">
              <Eye className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <div>
                <span className="text-slate-500 block">Warden / incharge sees:</span>
                <span className="font-semibold text-slate-700">
                  {currentUser.name} ({currentUser.rollNumber})
                </span>
              </div>
            </div>
          </div>
        </div>

        {progressMsg && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-[#0A192F] flex items-center gap-2" role="status">
            <Loader2 className="w-4 h-4 animate-spin text-[#D97706]" />
            <span>{progressMsg}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#0A192F] hover:bg-[#1B3A60] disabled:bg-slate-400 text-white text-xs font-bold rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            <span>{isSubmitting ? 'Submitting…' : 'Submit Grievance'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
