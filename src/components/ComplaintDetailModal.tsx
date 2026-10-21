import React, { useEffect, useState } from 'react';
import {
  X,
  Clock,
  Shield,
  Eye,
  EyeOff,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Send,
  Building,
  RotateCcw,
  History,
  MailCheck,
  Image as ImageIcon,
  Download,
  ZoomIn,
} from 'lucide-react';
import { Attachment, Complaint, ComplaintStatus, User } from '../types';
import { fetchEvidenceBlobUrl } from '../utils/authSession';
import { formatSLARemaining, isComplaintOverdue, getMaskedStudentInfo } from '../utils/slaHelpers';

/** Loads one private evidence image through the authenticated API (an <img src> cannot send the bearer token). */
const EvidenceThumb: React.FC<{ complaintId: string; att: Attachment; onOpen: (url: string) => void }> = ({
  complaintId,
  att,
  onOpen,
}) => {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoked = false;
    let created: string | null = null;
    fetchEvidenceBlobUrl(complaintId, att.id)
      .then((u) => {
        if (revoked) URL.revokeObjectURL(u);
        else {
          created = u;
          setUrl(u);
        }
      })
      .catch(() => setFailed(true));
    return () => {
      revoked = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [complaintId, att.id]);

  return (
    <div className="group relative bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs flex flex-col">
      <button
        type="button"
        disabled={!url}
        onClick={() => url && onOpen(url)}
        className="aspect-video w-full bg-slate-100 relative cursor-pointer overflow-hidden flex items-center justify-center"
      >
        {url ? (
          <img src={url} alt={att.originalFilename} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
        ) : (
          <span className="text-[11px] text-slate-400">{failed ? 'Could not load' : 'Loading…'}</span>
        )}
        {url && (
          <span className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
            <ZoomIn className="w-5 h-5 drop-shadow" />
          </span>
        )}
      </button>
      <div className="p-2 text-[11px] flex items-center justify-between gap-1">
        <div className="truncate font-medium text-slate-700 max-w-[120px]" title={att.originalFilename}>
          {att.originalFilename}
        </div>
        {url && (
          <a
            href={url}
            download={att.originalFilename}
            className="text-slate-500 hover:text-[#0A192F] p-1 rounded hover:bg-slate-100 transition-colors"
            title="Download photo"
          >
            <Download className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  );
};

interface ComplaintDetailModalProps {
  complaint: Complaint | null;
  currentUser: User;
  onClose: () => void;
  onUpdateStatus: (complaintId: string, newStatus: ComplaintStatus, remarks?: string) => void;
  onReopenComplaint?: (complaintId: string, remarks: string) => void;
}

export const ComplaintDetailModal: React.FC<ComplaintDetailModalProps> = ({
  complaint,
  currentUser,
  onClose,
  onUpdateStatus,
  onReopenComplaint,
}) => {
  const [remarks, setRemarks] = useState(complaint?.resolutionRemarks || '');
  const [selectedStatus, setSelectedStatus] = useState<ComplaintStatus>(
    complaint?.status || 'PENDING'
  );
  const [reopenRemarks, setReopenRemarks] = useState('');
  const [showReopenInput, setShowReopenInput] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Re-initialise the form whenever a different grievance (or a new status) is shown.
  useEffect(() => {
    setRemarks('');
    setSelectedStatus(complaint?.status || 'PENDING');
    setReopenRemarks('');
    setShowReopenInput(false);
    setPreviewImage(null);
  }, [complaint?.id, complaint?.status]);

  if (!complaint) return null;

  const sla = formatSLARemaining(complaint);
  const overdue = isComplaintOverdue(complaint);
  const student = getMaskedStudentInfo(complaint, currentUser);

  // Privileges
  const isOwnComplaint = currentUser.id === complaint.studentId;
  const canUpdate = currentUser.tierLevel >= 1 && !isOwnComplaint && complaint.status !== 'RESOLVED';
  // Only the student who filed it may reopen a resolved grievance (the server enforces this too).
  const canReopen = complaint.status === 'RESOLVED' && isOwnComplaint;

  const handleSaveStatus = () => {
    onUpdateStatus(complaint.id, selectedStatus, remarks);
    onClose();
  };

  const handleConfirmReopen = () => {
    if (onReopenComplaint) {
      onReopenComplaint(complaint.id, reopenRemarks || 'Grievance reopened by student.');
    }
    setShowReopenInput(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="bg-[#0A192F] px-6 py-4 text-white flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-amber-400">
                {complaint.trackingId}
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-xs text-slate-300 font-medium">
                {complaint.domain.replace('_', ' ')}
              </span>
            </div>
            <h2 className="text-base font-bold text-white line-clamp-1">{complaint.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* SLA & Status Banner */}
          <div
            className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
              overdue
                ? 'bg-red-50 border-red-200 text-red-900'
                : complaint.status === 'RESOLVED'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-blue-50 border-blue-200 text-[#0A192F]'
            }`}
          >
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 shrink-0" />
              <div>
                <span className="text-xs font-bold uppercase tracking-wider block">
                  Institutional SLA Status
                </span>
                <span className="text-xs">
                  Policy Snapshot: <strong>{complaint.slaDaysSnapshot || complaint.slaDays} Days</strong> · Status:{' '}
                  <strong>{sla.label}</strong>
                  {complaint.isReopened && (
                    <span className="ml-2 font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded text-[10px]">
                      Reopened ({complaint.reopenedCount || 1}x)
                    </span>
                  )}
                </span>
              </div>
            </div>
            {complaint.escalatedToLevel2 && (
              <span className="text-[11px] font-bold uppercase tracking-wider bg-red-200 text-red-900 px-2 py-1 rounded">
                Level 2 Escalated
              </span>
            )}
          </div>

          {/* Description */}
          <div>
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Grievance Description
            </h3>
            <p className="text-xs text-slate-800 bg-slate-50 p-4 rounded-xl border border-slate-200 leading-relaxed whitespace-pre-wrap">
              {complaint.description}
            </p>
          </div>

          {/* 3-Tier Confidentiality & Student Identity */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#D97706]" />
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Student Identity & 3-Tier Confidentiality
                </h4>
              </div>
              {complaint.isConfidential ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                  <EyeOff className="w-3 h-3" />
                  Confidential Flag Set
                </span>
              ) : (
                <span className="text-[11px] font-medium text-slate-500">Standard Visibility</span>
              )}
            </div>

            {student.isMasked ? (
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-xs space-y-1">
                <div className="font-semibold text-amber-900 flex items-center gap-1">
                  <EyeOff className="w-3.5 h-3.5 text-amber-700" />
                  Identity hidden by the server (confidential grievance)
                </div>
                <div className="text-slate-600 text-[11px]">
                  Student name, roll number and email are not sent to your browser at all.
                  Only the responsible warden / incharge and administrators can view submitter details.
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block text-[11px]">Student Name</span>
                  <span className="font-semibold text-slate-900">{student.displayName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Roll Number</span>
                  <span className="font-mono font-bold text-slate-900">{student.displayRollNo}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Email</span>
                  <span className="font-mono text-slate-600">{student.displayEmail}</span>
                </div>
              </div>
            )}
          </div>

          {/* Photo Evidence Attachments Section */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-[#D97706]" />
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Photo Evidence & Attachments
                </h4>
              </div>
              {complaint.attachments && complaint.attachments.length > 0 && (
                <span className="text-[11px] font-semibold text-slate-600 bg-slate-200/60 px-2 py-0.5 rounded">
                  {complaint.attachments.length} / 5 photos
                </span>
              )}
            </div>

            {complaint.attachments && complaint.attachments.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {complaint.attachments.map((att) => (
                  <EvidenceThumb key={att.id} complaintId={complaint.id} att={att} onOpen={setPreviewImage} />
                ))}
              </div>
            ) : complaint.isAnonymized ? (
              <p className="text-xs text-slate-500 italic py-1">
                No photo evidence is visible to you for this confidential grievance.
              </p>
            ) : (
              <p className="text-xs text-slate-500 italic py-1">No photo evidence was uploaded for this grievance.</p>
            )}
          </div>

          {/* Status History Audit Trail */}
          {complaint.statusHistory && complaint.statusHistory.length > 0 && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[#0A192F]" />
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Durable Status History & Audit Log
                </h4>
              </div>
              <div className="space-y-2">
                {complaint.statusHistory.map((h) => (
                  <div key={h.id} className="text-xs p-2.5 bg-white rounded border border-slate-200 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-800">
                        {h.previousStatus} &rarr; <span className="text-[#0A192F] font-bold">{h.newStatus}</span>
                      </div>
                      <div className="text-slate-600 mt-0.5">{h.remarks}</div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        By {h.changedByName} ({h.changedByRole})
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">
                      {new Date(h.timestamp).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Escalation Audit History */}
          {complaint.escalationHistory && complaint.escalationHistory.length > 0 && (
            <div className="p-4 bg-red-50/40 border border-red-200 rounded-xl space-y-2">
              <div className="flex items-center gap-2">
                <MailCheck className="w-4 h-4 text-red-600" />
                <h4 className="text-xs font-bold text-red-900 uppercase tracking-wider">
                  Level 2 Escalation Delivery Log
                </h4>
              </div>
              {complaint.escalationHistory.map((esc, i) => (
                <div key={i} className="text-xs text-slate-700 bg-white p-2.5 rounded border border-red-100 flex items-center justify-between">
                  <div>
                    <span className="font-semibold">Recipient:</span> {esc.recipientRole} ({esc.recipientEmail})
                    <div className="text-[10px] text-slate-400">{esc.triggeredBy}</div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                      Delivered
                    </span>
                    <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                      {new Date(esc.attemptedAt).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Reopen Workflow Button */}
          {canReopen && (
            <div className="p-4 bg-purple-50/50 border border-purple-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-purple-950 uppercase tracking-wider">
                    Unsatisfactory Resolution? Reopen Grievance
                  </h4>
                  <p className="text-xs text-purple-700 mt-0.5">
                    If the problem recurs or the fix was inadequate, you can reopen this ticket while preserving prior audit logs.
                  </p>
                </div>
                {!showReopenInput && (
                  <button
                    onClick={() => setShowReopenInput(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-lg transition-colors shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reopen Grievance</span>
                  </button>
                )}
              </div>

              {showReopenInput && (
                <div className="pt-2 space-y-2">
                  <textarea
                    rows={2}
                    value={reopenRemarks}
                    onChange={(e) => setReopenRemarks(e.target.value)}
                    placeholder="Explain why the grievance is being reopened (e.g. tap still leaking, wifi disconnected again)..."
                    className="w-full px-3 py-2 bg-white border border-purple-300 rounded text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-600"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowReopenInput(false)}
                      className="px-3 py-1 text-xs text-slate-600"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmReopen}
                      className="px-4 py-1.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded"
                    >
                      Confirm Reopen Ticket
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Workflow Status Controls (secretaries, wardens, admins) */}
          {canUpdate && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Update Grievance Status & Investigation Notes
              </h4>

              <div className="flex items-center gap-2">
                {(['PENDING', 'IN_PROGRESS', 'RESOLVED'] as ComplaintStatus[]).map((st) => (
                  <button
                    type="button"
                    key={st}
                    onClick={() => setSelectedStatus(st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      selectedStatus === st
                        ? 'bg-[#0A192F] text-white shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {st.replace('_', ' ')}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
                  Resolution Remarks / Investigation Notes
                </label>
                <textarea
                  rows={2}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Record actions taken, vendor contractor summoned, or replacement details..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0A192F]"
                />
              </div>

              <button
                type="button"
                onClick={handleSaveStatus}
                disabled={selectedStatus === complaint.status}
                className="w-full py-2 disabled:opacity-50 bg-[#0A192F] hover:bg-[#1B3A60] text-white text-xs font-bold rounded-lg transition-colors shadow-xs"
              >
                Save Grievance State
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-slate-900 rounded-xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 bg-slate-950 text-white flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">
                Verified Photo Evidence Inspection
              </span>
              <button
                onClick={() => setPreviewImage(null)}
                className="p-1 rounded text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-2 flex items-center justify-center overflow-auto max-h-[80vh]">
              <img
                src={previewImage}
                alt="Enlarged photo evidence"
                className="max-h-[75vh] w-auto object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
