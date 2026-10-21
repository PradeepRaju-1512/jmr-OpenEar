import React, { useState } from 'react';
import {
  ShieldAlert,
  CheckCircle,
  XCircle,
  AlertOctagon,
  UserCheck,
  Award,
  Info,
  Clock,
  FileText,
} from 'lucide-react';
import { Complaint, User } from '../types';
import { isComplaintOverdue } from '../utils/slaHelpers';

interface AdminScorePanelProps {
  currentUser: User;
  complaints: Complaint[];
  users: User[];
  onApplyPenalty: (complaintId: string, secretaryRole: string, points: number, reason: string) => void;
  onDismissPenalty: (complaintId: string, reason: string) => void;
}

export const AdminScorePanel: React.FC<AdminScorePanelProps> = ({
  currentUser,
  complaints,
  users,
  onApplyPenalty,
  onDismissPenalty,
}) => {
  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'APPLY' | 'DISMISS' | null>(null);
  const [reasonInput, setReasonInput] = useState('');
  const [penaltyPoints, setPenaltyPoints] = useState(1);

  // Grievances whose deadline was missed (still open, or resolved late) - the server sets `slaBreached`.
  const breachedComplaints = complaints.filter((c) => c.slaBreached);
  const secretaries = users.filter((u) => u.tierLevel === 1);

  const handleOpenActionModal = (complaintId: string, type: 'APPLY' | 'DISMISS') => {
    setSelectedComplaintId(complaintId);
    setActionType(type);
    setReasonInput(
      type === 'APPLY'
        ? 'Audited SLA deadline breach without valid vendor delay waiver.'
        : 'Dismissed: Documented external vendor contractor / OEM spare parts delay.'
    );
  };

  const handleConfirmAction = () => {
    if (!selectedComplaintId || !actionType) return;
    const complaint = complaints.find((c) => c.id === selectedComplaintId);
    if (!complaint) return;

    if (actionType === 'APPLY') {
      onApplyPenalty(selectedComplaintId, complaint.assignedRole, penaltyPoints, reasonInput);
    } else {
      onDismissPenalty(selectedComplaintId, reasonInput);
    }

    setSelectedComplaintId(null);
    setActionType(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#D97706] uppercase tracking-wider flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              SLA Compliance & Administrative Audit
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-600 font-semibold">{currentUser.roleTitle}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">
            Secretary Accountability & Negative Scoring Audit
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Rule enforcement: Negative points are applied <strong>only</strong> after an administrator verifies a missed deadline. Each decision is logged, cannot be applied twice, and the Mess Warden is emailed when a secretary's score goes above 10.
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-xs text-amber-900 max-w-sm">
          <span className="font-bold block">Audited Decision States:</span>
          Complaints can be <span className="font-semibold text-amber-800">Pending Review</span>,{' '}
          <span className="font-semibold text-rose-700">Verified & Penalized</span>, or{' '}
          <span className="font-semibold text-slate-700">Dismissed</span> (e.g. genuine vendor spare-parts delay).
        </div>
      </div>

      {/* Secretary Accountability Ledger */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Student Council Secretary Performance Ledger
          </h2>
          <span className="text-xs text-slate-500">Tier 1 Secretary Score Records</span>
        </div>

        <div className="divide-y divide-slate-200">
          {secretaries.map((sec) => {
            const secComplaints = complaints.filter((c) => c.assignedSecretaryName === sec.name);
            const activeOverdue = secComplaints.filter(isComplaintOverdue).length;

            return (
              <div
                key={sec.id}
                className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">{sec.name}</span>
                    <span className="text-xs text-slate-500">({sec.roleTitle})</span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {sec.email} · Roll: {sec.rollNumber}
                  </div>
                </div>

                <div className="flex items-center gap-6 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Domain</span>
                    <span className="font-semibold text-slate-700">
                      {sec.domainScope?.join(', ')}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Active Overdue</span>
                    <span className={`font-mono font-bold ${activeOverdue > 0 ? 'text-red-600' : 'text-slate-700'}`}>
                      {activeOverdue}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-slate-400 block text-[10px] uppercase">Penalty Points</span>
                    <span className={`font-mono font-bold text-sm ${sec.negativePoints > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {sec.negativePoints} pts
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Overdue Grievance Audit Queue */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 text-red-600" />
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Overdue Grievance Audit Queue ({breachedComplaints.length})
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Audit decisions: Pending Review · Verified Applied · Dismissed
          </span>
        </div>

        {breachedComplaints.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
            No active overdue SLA breaches requiring verification.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {breachedComplaints.map((complaint) => {
              return (
                <div
                  key={complaint.id}
                  className="p-5 flex flex-col md:flex-row md:items-start justify-between gap-4 bg-red-50/15 hover:bg-red-50/30 transition-colors"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono font-bold text-[#0A192F]">
                        {complaint.trackingId}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-slate-700">
                        {complaint.categoryName} ({complaint.domain.replace('_', ' ')})
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="text-red-600 font-bold font-mono">
                        SLA: {complaint.slaDaysSnapshot} Days (BREACHED)
                      </span>
                    </div>

                    <h3 className="text-xs font-bold text-slate-900">{complaint.title}</h3>
                    <p className="text-xs text-slate-600 line-clamp-1">{complaint.description}</p>

                    <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-3 pt-0.5">
                      <span>Responsible: <strong>{complaint.assignedSecretaryName || complaint.assignedRole}</strong></span>
                      <span>·</span>
                      <span>Student: {complaint.studentName} ({complaint.studentRollNo})</span>
                      {complaint.penaltyReason && (
                        <>
                          <span>·</span>
                          <span className="text-slate-600 italic">Audit Note: {complaint.penaltyReason}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Decision State Display & Actions */}
                  <div className="flex items-center gap-3 shrink-0">
                    {complaint.penaltyDecision === 'VERIFIED_APPLIED' ? (
                      <div className="text-right">
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-100 px-2.5 py-1 rounded">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Penalty Applied (-{complaint.penaltyPointsAmount} pt)
                        </span>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Verified by {complaint.penaltyVerifiedByAdmin || 'Admin'}
                        </div>
                      </div>
                    ) : complaint.penaltyDecision === 'DISMISSED' ? (
                      <div className="text-right">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 bg-slate-200 px-2.5 py-1 rounded">
                          <CheckCircle className="w-3.5 h-3.5 text-slate-500" />
                          Dismissed (External Factor)
                        </span>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Reviewed by {complaint.penaltyVerifiedByAdmin || 'Admin'} · No Penalty
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenActionModal(complaint.id, 'APPLY')}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition-colors shadow-xs"
                        >
                          Verify & Apply Penalty
                        </button>
                        <button
                          onClick={() => handleOpenActionModal(complaint.id, 'DISMISS')}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors border border-slate-200"
                        >
                          Dismiss (Vendor Delay)
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmation Modal with Reason Input */}
      {selectedComplaintId && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900">
              {actionType === 'APPLY' ? 'Verify and Apply Negative Scoring Point' : 'Dismiss SLA Breach Without Penalty'}
            </h3>
            <p className="text-xs text-slate-600">
              {actionType === 'APPLY'
                ? 'This action will formally increment the responsible secretary’s negative score ledger. Please provide an audit justification:'
                : 'Dismiss this SLA breach if the delay was caused by third-party suppliers, university procurement, or authorized power outages:'}
            </p>

            {actionType === 'APPLY' && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
                  Penalty Points Amount
                </label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={penaltyPoints}
                  onChange={(e) => setPenaltyPoints(Number(e.target.value) || 1)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
                Audit Record Reason / Note
              </label>
              <textarea
                rows={3}
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0A192F]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => {
                  setSelectedComplaintId(null);
                  setActionType(null);
                }}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAction}
                className={`px-4 py-1.5 text-xs font-bold text-white rounded-lg transition-colors ${
                  actionType === 'APPLY' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#0A192F] hover:bg-[#1B3A60]'
                }`}
              >
                Confirm Decision
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
