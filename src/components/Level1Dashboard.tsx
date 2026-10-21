import React, { useState } from 'react';
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Shield,
  EyeOff,
  User as UserIcon,
  MapPin,
  ExternalLink,
} from 'lucide-react';
import { Complaint, ComplaintStatus, User } from '../types';
import { formatSLARemaining, isComplaintOverdue, getMaskedStudentInfo } from '../utils/slaHelpers';

interface Level1DashboardProps {
  currentUser: User;
  complaints: Complaint[];
  onSelectComplaint: (complaint: Complaint) => void;
  onUpdateStatus: (complaintId: string, newStatus: ComplaintStatus, remarks?: string) => void;
}

export const Level1Dashboard: React.FC<Level1DashboardProps> = ({
  currentUser,
  complaints,
  onSelectComplaint,
  onUpdateStatus,
}) => {
  const [activeTab, setActiveTab] = useState<ComplaintStatus>('PENDING');

  // Filter complaints assigned to this Secretary's domain scope
  const domainComplaints = complaints.filter((c) => {
    // Fail closed: the server already filters, and an empty scope shows nothing.
    return c.studentId === currentUser.id || (currentUser.domainScope ?? []).includes(c.domain);
  });

  const pendingComplaints = domainComplaints.filter((c) => c.status === 'PENDING');
  const inProgressComplaints = domainComplaints.filter((c) => c.status === 'IN_PROGRESS');
  const resolvedComplaints = domainComplaints.filter((c) => c.status === 'RESOLVED');

  const currentTabComplaints = domainComplaints.filter((c) => c.status === activeTab);
  const overdueCount = domainComplaints.filter(isComplaintOverdue).length;

  return (
    <div className="space-y-6">
      {/* Secretary Header & Domain Overview */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#D97706] uppercase tracking-wider">
              Level 1 Secretary Console
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-600 font-semibold">{currentUser.roleTitle}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">
            Grievances Assigned to {currentUser.domainScope?.map((d) => d.replace('_', ' ')).join(', ') || 'Domain'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Process complaints strictly assigned to your domain within mandatory institutional SLAs.
          </p>
        </div>

        {/* Secretary Accountability Indicator */}
        <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
          <div>
            <span className="text-slate-500 block">SLA Breaches (Overdue)</span>
            <span className="font-mono font-bold text-red-600 text-sm">
              {overdueCount} Active
            </span>
          </div>
          <div className="border-l border-slate-200 pl-4">
            <span className="text-slate-500 block">Accumulated Negative Points</span>
            <span className={`font-mono font-bold text-sm ${currentUser.negativePoints > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {currentUser.negativePoints} pts {currentUser.negativePoints > 0 ? '(Audited by Admin)' : '(Clean Record)'}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs: Pending, In Progress, Resolved */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('PENDING')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'PENDING'
              ? 'bg-[#0A192F] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <span>Pending</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
            activeTab === 'PENDING' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {pendingComplaints.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('IN_PROGRESS')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'IN_PROGRESS'
              ? 'bg-[#0A192F] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <span>In Progress</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
            activeTab === 'IN_PROGRESS' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {inProgressComplaints.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('RESOLVED')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'RESOLVED'
              ? 'bg-[#0A192F] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <span>Resolved</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
            activeTab === 'RESOLVED' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {resolvedComplaints.length}
          </span>
        </button>
      </div>

      {/* Complaints List */}
      {currentTabComplaints.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
          <h3 className="text-sm font-bold text-slate-800">Queue is Clear</h3>
          <p className="text-xs text-slate-500 mt-1">
            No complaints currently in <span className="font-semibold">{activeTab.toLowerCase().replace('_', ' ')}</span> status for your domain.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {currentTabComplaints.map((complaint) => {
            const sla = formatSLARemaining(complaint);
            const overdue = isComplaintOverdue(complaint);
            const maskedStudent = getMaskedStudentInfo(complaint, currentUser);

            return (
              <div
                key={complaint.id}
                className={`bg-white rounded-xl border p-5 transition-all shadow-subtle hover:border-slate-300 ${
                  overdue ? 'border-red-300 bg-red-50/20' : 'border-slate-200'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    {/* Top Meta Line: Clean unboxed metadata with bullet separators */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono font-bold text-[#0A192F]">
                        {complaint.trackingId}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-slate-700">
                        {complaint.categoryName} {complaint.subOption ? `(${complaint.subOption})` : ''}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>SLA: {complaint.slaDaysSnapshot || complaint.slaDays} Days</span>

                      {/* Confidentiality Indicator */}
                      {complaint.isConfidential && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            <EyeOff className="w-3 h-3" />
                            Confidential Grievance
                          </span>
                        </>
                      )}

                      {/* Escalation to Level 2 Badge */}
                      {complaint.escalatedToLevel2 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded">
                            <AlertTriangle className="w-3 h-3" />
                            Escalated to Warden
                          </span>
                        </>
                      )}
                    </div>

                    {/* Complaint Title */}
                    <h3
                      onClick={() => onSelectComplaint(complaint)}
                      className="text-sm font-bold text-slate-900 hover:text-[#0A192F] cursor-pointer"
                    >
                      {complaint.title}
                    </h3>

                    {/* Description excerpt */}
                    <p className="text-xs text-slate-600 line-clamp-2">
                      {complaint.description}
                    </p>

                    {/* Submitter & Location Details */}
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                      <div className="flex items-center gap-1.5">
                        <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                        {maskedStudent.isMasked ? (
                          <span className="font-mono font-medium text-amber-800 bg-amber-50/70 px-1.5 py-0.5 rounded text-[11px]">
                            {maskedStudent.displayName} [Roll Protected]
                          </span>
                        ) : (
                          <span className="font-medium text-slate-800">
                            {maskedStudent.displayName} ({maskedStudent.displayRollNo})
                          </span>
                        )}
                      </div>

                      {complaint.locationCode && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-mono text-slate-700">{complaint.locationCode}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Zone: SLA Timer & Quick Actions */}
                  <div className="flex flex-col items-end gap-3 shrink-0">
                    <div className="text-right">
                      <span className="text-[11px] text-slate-400 block">SLA Status</span>
                      <div
                        className={`text-xs font-mono font-bold flex items-center gap-1 ${
                          sla.severity === 'overdue'
                            ? 'text-red-600'
                            : sla.severity === 'warning'
                            ? 'text-amber-600'
                            : 'text-slate-700'
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>{sla.label}</span>
                      </div>
                    </div>

                    {/* Interactive Workflow Buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onSelectComplaint(complaint)}
                        className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                      >
                        Inspect
                      </button>

                      {complaint.status === 'PENDING' && (
                        <button
                          onClick={() => onUpdateStatus(complaint.id, 'IN_PROGRESS', 'Investigation initiated by domain secretary')}
                          className="px-3 py-1.5 text-xs font-bold text-white bg-[#0A192F] hover:bg-[#1B3A60] rounded-lg transition-colors shadow-xs"
                        >
                          Start Investigation
                        </button>
                      )}

                      {complaint.status === 'IN_PROGRESS' && (
                        <button
                          onClick={() => onUpdateStatus(complaint.id, 'RESOLVED', 'Issue resolved and verified by secretary.')}
                          className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-xs"
                        >
                          Mark Resolved
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
