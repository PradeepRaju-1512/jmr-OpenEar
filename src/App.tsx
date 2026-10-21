import React, { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  Clock,
  Shield,
  Layers,
  FileCode,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  Sparkles,
  QrCode,
  CheckCircle,
  LogIn,
  EyeOff,
  UserCheck,
  Building2,
  Crown,
  FileText,
  AlertTriangle,
} from 'lucide-react';

import { User, Complaint, ComplaintStatus } from './types';
import { Navbar } from './components/Navbar';
import { StudentComplaintForm } from './components/StudentComplaintForm';
import { StudentDashboard } from './components/StudentDashboard';
import { Level1Dashboard } from './components/Level1Dashboard';
import { Level2Dashboard } from './components/Level2Dashboard';
import { AdminScorePanel } from './components/AdminScorePanel';
import { ProfileSetupModal } from './components/ProfileSetupModal';
import { GoogleOAuthModal } from './components/GoogleOAuthModal';
import { SLAMatrixModal } from './components/SLAMatrixModal';
import { ComplaintDetailModal } from './components/ComplaintDetailModal';
import { IIITTCrest } from './components/IIITTCrest';
import {
  apiFetch,
  fetchCurrentUser,
  logoutUser,
  readApiError,
  UNAUTHORIZED_EVENT,
} from './utils/authSession';

export default function App() {
  // Current Authenticated User (Loaded from verified backend session)
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [users, setUsers] = useState<User[]>([]);

  // Complaints Collection (Authoritatively loaded from backend database)
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [isLoadingComplaints, setIsLoadingComplaints] = useState(false);

  // Error & Status Notification State
  const [apiErrorMessage, setApiErrorMessage] = useState<string | null>(null);
  const [apiSuccessMessage, setApiSuccessMessage] = useState<string | null>(null);

  // Navigation State
  const [activeView, setActiveView] = useState<'dashboard' | 'file-complaint' | 'admin-scores'>('dashboard');

  // Modals State
  const [isOAuthModalOpen, setIsOAuthModalOpen] = useState(false);
  const [isSLAMatrixOpen, setIsSLAMatrixOpen] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);

  // Result banner for the admin-triggered SLA scan
  const [celeryAlert, setCeleryAlert] = useState<string | null>(null);

  // 1. Initial Session Restoration from Backend
  useEffect(() => {
    async function restoreSession() {
      const check = await fetchCurrentUser();
      if (check.status === 'ok') {
        setCurrentUser(check.user);
      } else if (check.status === 'unreachable') {
        setApiErrorMessage('Cannot reach the OpenEar server right now. Please try again shortly.');
      }
      setIsCheckingSession(false);
    }
    restoreSession();

    const onUnauthorized = () => {
      setCurrentUser(null);
      setComplaints([]);
      setApiErrorMessage('Your session has expired. Please sign in again.');
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  // 2. Fetch User Roster (for Admin Scoring view)
  const fetchUsersRoster = useCallback(async () => {
    if (!currentUser) return;
    try {
      const res = await apiFetch('/api/v1/users/');
      if (res.ok) {
        const data: User[] = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.warn('Failed to fetch user roster:', err);
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      fetchUsersRoster();
    }
  }, [currentUser, fetchUsersRoster]);

  // 3. Fetch Complaints from Backend API whenever currentUser changes
  // Server-authoritative: enforces role filtering and server-side confidentiality stripping
  const fetchComplaints = useCallback(async () => {
    if (!currentUser) {
      setComplaints([]);
      return;
    }

    setIsLoadingComplaints(true);
    setApiErrorMessage(null);

    try {
      const res = await apiFetch('/api/v1/complaints/');

      if (!res.ok) {
        throw new Error(await readApiError(res, 'Could not load grievances'));
      }

      const data: Complaint[] = await res.json();
      setComplaints(data);
    } catch (err: any) {
      console.error('Error fetching complaints from API:', err);
      setApiErrorMessage(
        err.message || 'Failed to load complaints from backend. Please verify your connection.'
      );
      // Never fall back to made-up data: show the error and keep the real state.
    } finally {
      setIsLoadingComplaints(false);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  // Clear transient alerts after delay
  useEffect(() => {
    if (apiErrorMessage || apiSuccessMessage) {
      const timer = setTimeout(() => {
        setApiErrorMessage(null);
        setApiSuccessMessage(null);
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [apiErrorMessage, apiSuccessMessage]);

  // Handlers for genuine server mutations
  const handleAddNewComplaint = (created: Complaint[]) => {
    const ids = new Set(created.map((c) => c.id));
    setComplaints((prev) => [...created, ...prev.filter((c) => !ids.has(c.id))]);
    setActiveView('dashboard');
    setApiSuccessMessage(
      `Grievance${created.length > 1 ? 's' : ''} ${created.map((c) => '#' + c.trackingId).join(', ')} registered.`
    );
  };

  const handleUpdateStatus = async (complaintId: string, newStatus: ComplaintStatus, remarks?: string) => {
    setApiErrorMessage(null);
    try {
      const res = await apiFetch(`/api/v1/complaints/${complaintId}/status/`, {
        method: 'POST',
        body: JSON.stringify({ status: newStatus, remarks }),
      });

      if (!res.ok) {
        throw new Error(await readApiError(res, 'Failed to transition status'));
      }

      const updated: Complaint = await res.json();
      setComplaints((prev) => prev.map((c) => (c.id === complaintId ? updated : c)));
      if (selectedComplaint && selectedComplaint.id === complaintId) {
        setSelectedComplaint(updated);
      }
      setApiSuccessMessage(`Status updated to ${newStatus} for grievance #${updated.trackingId}.`);
    } catch (err: any) {
      // Failures are always shown to the user; nothing is ever faked locally.
      console.error('Status update failed on server:', err);
      setApiErrorMessage(err.message || 'Server rejected the status transition.');
    }
  };

  const handleReopenComplaint = async (complaintId: string, remarks: string) => {
    setApiErrorMessage(null);
    try {
      const res = await apiFetch(`/api/v1/complaints/${complaintId}/reopen/`, {
        method: 'POST',
        body: JSON.stringify({ remarks }),
      });

      if (!res.ok) {
        throw new Error(await readApiError(res, 'Failed to reopen grievance'));
      }

      const updated: Complaint = await res.json();
      setComplaints((prev) => prev.map((c) => (c.id === complaintId ? updated : c)));
      if (selectedComplaint && selectedComplaint.id === complaintId) {
        setSelectedComplaint(updated);
      }
      setApiSuccessMessage(`Grievance #${updated.trackingId} reopened with a fresh deadline.`);
    } catch (err: any) {
      console.error('Reopen request failed:', err);
      setApiErrorMessage(err.message || 'Server rejected the reopening request.');
    }
  };

  const handleApplyPenalty = async (complaintId: string, secretaryRole: string, points: number, reason: string) => {
    setApiErrorMessage(null);
    try {
      const res = await apiFetch(`/api/v1/complaints/${complaintId}/penalty/`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'VERIFIED_APPLIED', points, reason }),
      });

      if (!res.ok) {
        throw new Error(await readApiError(res, 'Failed to apply penalty'));
      }

      const data = await res.json();
      setComplaints((prev) => prev.map((c) => (c.id === complaintId ? data.complaint : c)));
      if (data.updatedUsers) {
        setUsers(data.updatedUsers);
      }
      setApiSuccessMessage(`Applied ${points} verified SLA breach penalty points.`);
    } catch (err: any) {
      console.error('Penalty verification failed:', err);
      setApiErrorMessage(err.message || 'Server rejected penalty verification.');
    }
  };

  const handleDismissPenalty = async (complaintId: string, reason: string) => {
    setApiErrorMessage(null);
    try {
      const res = await apiFetch(`/api/v1/complaints/${complaintId}/penalty/`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'DISMISSED', reason }),
      });

      if (!res.ok) {
        throw new Error(await readApiError(res, 'Failed to dismiss penalty'));
      }

      const data = await res.json();
      setComplaints((prev) => prev.map((c) => (c.id === complaintId ? data.complaint : c)));
      if (data.updatedUsers) {
        setUsers(data.updatedUsers);
      }
      setApiSuccessMessage('Penalty inquiry dismissed with verified impediment documentation.');
    } catch (err: any) {
      console.error('Dismissal request failed:', err);
      setApiErrorMessage(err.message || 'Server rejected penalty dismissal.');
    }
  };

  const handleRunCeleryEscalationCheck = async () => {
    setApiErrorMessage(null);
    try {
      const res = await apiFetch('/api/v1/escalations/trigger-scan/', { method: 'POST' });

      if (!res.ok) {
        throw new Error(await readApiError(res, 'Escalation scan failed'));
      }

      const data = await res.json();
      setCeleryAlert(
        `SLA scan complete: ${data.escalatedCount} escalation email(s) delivered` +
          (data.failedCount ? `, ${data.failedCount} failed (will be retried automatically)` : '') +
          '.'
      );
      fetchComplaints();
    } catch (err: any) {
      console.error('Escalation scan error:', err);
      setApiErrorMessage(err.message || 'Failed to run the SLA scan.');
    }

    setTimeout(() => {
      setCeleryAlert(null);
    }, 7000);
  };

  const handleLogout = async () => {
    await logoutUser();
    setCurrentUser(null);
    setComplaints([]);
    setActiveView('dashboard');
    setApiSuccessMessage('Successfully signed out of institutional session.');
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans text-slate-800">
      {/* Navbar with Responsive Top Bar Contract */}
      <Navbar
        currentUser={currentUser}
        activeView={activeView}
        onNavigate={setActiveView}
        onOpenOAuthModal={() => setIsOAuthModalOpen(true)}
        onOpenSLAMatrix={() => setIsSLAMatrixOpen(true)}
        onLogout={handleLogout}
      />

      {/* Global Alerts & Toasts */}
      {apiErrorMessage && (
        <div className="bg-rose-50 border-b border-rose-200 px-4 py-2.5 text-xs text-rose-800 flex items-center justify-between max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-semibold">{apiErrorMessage}</span>
          </div>
          <button
            onClick={() => setApiErrorMessage(null)}
            className="text-rose-500 hover:text-rose-800 font-bold px-2 py-0.5 rounded"
          >
            &times;
          </button>
        </div>
      )}

      {apiSuccessMessage && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 text-xs text-emerald-800 flex items-center justify-between max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{apiSuccessMessage}</span>
          </div>
          <button
            onClick={() => setApiSuccessMessage(null)}
            className="text-emerald-500 hover:text-emerald-800 font-bold px-2 py-0.5 rounded"
          >
            &times;
          </button>
        </div>
      )}

      {/* Institutional Context Ribbon for Authenticated Users */}
      {currentUser && (
        <div className="bg-slate-100 border-b border-slate-200 px-4 sm:px-6 py-2">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">Signed in as:</span>
              <span className="bg-[#0A192F] text-amber-300 font-bold px-2 py-0.5 rounded text-[11px]">
                {currentUser.tierLevel === 0
                  ? 'Student'
                  : currentUser.tierLevel === 1
                  ? 'Level 1: Secretary'
                  : currentUser.tierLevel === 2
                  ? 'Level 2: Warden'
                  : 'System Administrator'}
              </span>
              <span className="text-slate-500 font-medium">
                ({currentUser.name} · {currentUser.email})
              </span>
              {currentUser.domainScope && currentUser.domainScope.length > 0 && (
                <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono">
                  Domains: {currentUser.domainScope.join(', ')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {currentUser.tierLevel === 99 && (
                <button
                  onClick={handleRunCeleryEscalationCheck}
                  className="text-[11px] font-semibold text-slate-700 hover:text-[#0A192F] flex items-center gap-1 bg-white px-2.5 py-1 rounded border border-slate-300 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
                  title="Runs the same SLA escalation scan that Celery runs every 15 minutes"
                >
                  <Clock className="w-3 h-3 text-[#D97706]" />
                  <span>Run SLA Escalation Scan</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scan result notification */}
      {celeryAlert && (
        <div className="bg-[#0A192F] text-amber-300 text-xs py-2 px-4 text-center font-medium border-b border-amber-500/30 flex items-center justify-center gap-2 animate-fade-in">
          <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>{celeryAlert}</span>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        {!currentUser ? (
          /* Institutional Sign-In Gate & Landing Page */
          <div className="max-w-4xl mx-auto space-y-8 py-6">
            {/* Hero Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden text-center p-8 sm:p-12 relative">
              <div className="w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                <IIITTCrest size={72} />
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-[#0A192F] rounded-full text-xs font-bold mb-4 border border-blue-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Official Student Council Grievance Portal
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-[#0A192F] tracking-tight">
                IIITT Student Grievance & Redressal Platform
              </h1>
              <p className="text-slate-600 text-sm sm:text-base max-w-2xl mx-auto mt-3">
                Indian Institute of Information Technology Tiruchirappalli. Secretaries handle your grievance first; if the deadline passes it is escalated to the responsible warden or incharge by email. Confidential grievances hide your identity from secretaries, and every deadline is calculated by the server.
              </p>

              {/* Login Call to Action */}
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  onClick={() => setIsOAuthModalOpen(true)}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 py-3 px-6 bg-[#0A192F] hover:bg-[#152e50] text-white text-sm font-bold rounded-xl transition-all shadow-md hover:shadow-lg cursor-pointer"
                >
                  <LogIn className="w-4 h-4 text-amber-300" />
                  <span>Sign In with @iiitt.ac.in Account</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

              </div>

              <div className="mt-6 text-xs text-slate-500 flex items-center justify-center gap-4">
                <span className="flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                  Institutional SSO Enforced
                </span>
                <span className="flex items-center gap-1">
                  <EyeOff className="w-3.5 h-3.5 text-blue-600" />
                  Zero-Leak Confidentiality
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  Fixed 3-7 day deadlines
                </span>
              </div>
            </div>

            {/* Architecture Highlights */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-2">
                <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#0A192F] flex items-center justify-center">
                  <Layers className="w-5 h-5 text-[#D97706]" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Automatic Escalation</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Secretaries handle domain grievances. If a grievance is still unresolved at its deadline, the server emails the responsible warden or incharge and records whether the email was actually delivered.
                </p>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-2">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-emerald-600" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Multi-Domain Portfolios</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Supports shared portfolios: Boys&apos; &amp; Girls&apos; Mess &amp; Hostel Secretaries receive access to both Mess and their respective Hostel blocks without cross-hostel leakage.
                </p>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-2">
                <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-amber-600" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Verifiable Evidence System</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Attach up to 5 photos per grievance. Images are validated, stripped of location/camera metadata, stored privately and only shown to people allowed to see the grievance.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Authenticated Dashboard Views */
          <>
            {activeView === 'file-complaint' && (
              <StudentComplaintForm
                currentUser={currentUser}
                onSubmitComplaint={handleAddNewComplaint}
                onCancel={() => setActiveView('dashboard')}
              />
            )}

            {activeView === 'admin-scores' && (
              <AdminScorePanel
                currentUser={currentUser}
                complaints={complaints}
                users={users}
                onApplyPenalty={handleApplyPenalty}
                onDismissPenalty={handleDismissPenalty}
              />
            )}

            {activeView === 'dashboard' && (
              <>
                {currentUser.tierLevel === 0 && (
                  <StudentDashboard
                    currentUser={currentUser}
                    complaints={complaints}
                    onOpenNewComplaint={() => setActiveView('file-complaint')}
                    onSelectComplaint={(c) => setSelectedComplaint(c)}
                  />
                )}

                {currentUser.tierLevel === 1 && (
                  <Level1Dashboard
                    currentUser={currentUser}
                    complaints={complaints}
                    onSelectComplaint={(c) => setSelectedComplaint(c)}
                    onUpdateStatus={handleUpdateStatus}
                  />
                )}

                {currentUser.tierLevel === 2 && (
                  <Level2Dashboard
                    currentUser={currentUser}
                    complaints={complaints}
                    onSelectComplaint={(c) => setSelectedComplaint(c)}
                  />
                )}

                {currentUser.tierLevel === 99 && (
                  <AdminScorePanel
                    currentUser={currentUser}
                    complaints={complaints}
                    users={users}
                    onApplyPenalty={handleApplyPenalty}
                    onDismissPenalty={handleDismissPenalty}
                  />
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* Institutional Footer */}
      <footer className="bg-white border-t border-slate-200 mt-auto py-6 px-4 sm:px-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-bold text-[#0A192F]">OpenEar · IIITT</span>
            <span aria-hidden="true">·</span>
            <span>Indian Institute of Information Technology Tiruchirappalli</span>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <button onClick={() => setIsSLAMatrixOpen(true)} className="hover:underline cursor-pointer">
              SLA Routing Policy
            </button>
            {!currentUser && (
              <button onClick={() => setIsOAuthModalOpen(true)} className="hover:underline cursor-pointer">
                Sign in
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* Global Modals */}
      <GoogleOAuthModal
        isOpen={isOAuthModalOpen}
        onClose={() => setIsOAuthModalOpen(false)}
        onLoginSuccess={(u) => {
          setCurrentUser(u);
          setActiveView('dashboard');
        }}
      />

      <SLAMatrixModal
        isOpen={isSLAMatrixOpen}
        onClose={() => setIsSLAMatrixOpen(false)}
      />

      {currentUser && currentUser.tierLevel === 0 && currentUser.needsProfile && (
        <ProfileSetupModal onCompleted={(u) => setCurrentUser(u)} onSignOut={handleLogout} />
      )}

      <ComplaintDetailModal
        complaint={selectedComplaint}
        currentUser={currentUser || {
          id: 'anon',
          name: 'Anonymous',
          email: 'anon@iiitt.ac.in',
          rollNumber: 'anon',
          role: 'STUDENT',
          roleTitle: 'Guest',
          tierLevel: 0,
          negativePoints: 0,
        }}
        onClose={() => setSelectedComplaint(null)}
        onUpdateStatus={handleUpdateStatus}
        onReopenComplaint={handleReopenComplaint}
      />
    </div>
  );
}
