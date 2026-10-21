import React, { useState } from 'react';
import {
  AlertOctagon,
  CheckCircle2,
  ListFilter,
  ShieldAlert,
  Clock,
  User as UserIcon,
  MapPin,
  ExternalLink,
  ChevronRight,
  MailWarning,
  Eye,
} from 'lucide-react';
import { Complaint, User } from '../types';
import { formatSLARemaining, isComplaintOverdue, getMaskedStudentInfo } from '../utils/slaHelpers';

interface Level2DashboardProps {
  currentUser: User;
  complaints: Complaint[];
  onSelectComplaint: (complaint: Complaint) => void;
}

export const Level2Dashboard: React.FC<Level2DashboardProps> = ({
  currentUser,
  complaints,
  onSelectComplaint,
}) => {
  // 3 Mandatory Buckets for Level 2 Department Heads: "Neglected", "Cleared", "Others"
  const [activeBucket, setActiveBucket] = useState<'Neglected' | 'Cleared' | 'Others'>('Neglected');

  // Filter complaints by Department Scope
  const deptComplaints = complaints.filter((c) => {
    if (!currentUser.domainScope || currentUser.domainScope.length === 0) return true;
    return currentUser.domainScope.includes(c.domain);
  });

  // Categorize into the 3 official buckets:
  // 1. "Neglected": Overdue complaints where deadline < now and status != RESOLVED
  const neglectedComplaints = deptComplaints.filter((c) => isComplaintOverdue(c));

  // 2. "Cleared": Resolved complaints
  const clearedComplaints = deptComplaints.filter((c) => c.status === 'RESOLVED');

  // 3. "Others": Active / Pending / In-Progress complaints that are still within deadline
  const othersComplaints = deptComplaints.filter(
    (c) => c.status !== 'RESOLVED' && !isComplaintOverdue(c)
  );

  const getBucketComplaints = () => {
    switch (activeBucket) {
      case 'Neglected':
        return neglectedComplaints;
      case 'Cleared':
        return clearedComplaints;
      case 'Others':
        return othersComplaints;
    }
  };

  const currentComplaints = getBucketComplaints();

  return (
    <div className="space-y-6">
      {/* Department Head Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#D97706] uppercase tracking-wider">
              Level 2 Department Oversight
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-600 font-semibold">{currentUser.roleTitle}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">
            Department Head Console: {currentUser.domainScope?.map((d) => d.replace('_', ' ')).join(', ') || 'All Sectors'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Institutional oversight console with automatic overdue escalations and unmasked student identity.
          </p>
        </div>

        {/* Level 2 Privilege Badge */}
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg text-xs text-[#0A192F]">
          <Eye className="w-4 h-4 text-emerald-600 shrink-0" />
          <div>
            <span className="font-bold">Confidentiality Privilege:</span> Student identity unmasked for official investigation.
          </div>
        </div>
      </div>

      {/* 3 Mandatory Level 2 Buckets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Bucket 1: Neglected (Overdue) */}
        <button
          onClick={() => setActiveBucket('Neglected')}
          className={`p-4 rounded-xl border text-left transition-all relative ${
            activeBucket === 'Neglected'
              ? 'border-red-500 bg-red-50/50 ring-2 ring-red-500 shadow-xs'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-red-100 text-red-700 flex items-center justify-center font-bold">
                <AlertOctagon className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Neglected (Overdue)
              </span>
            </div>
            <span className="font-mono text-xl font-bold text-red-600">
              {neglectedComplaints.length}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Breached SLA deadline without resolution. Escalated automatically via email.
          </p>
          {neglectedComplaints.length > 0 && (
            <div className="mt-2 text-[10px] font-bold text-red-700 uppercase tracking-wider">
              Requires Warden Intervention
            </div>
          )}
        </button>

        {/* Bucket 2: Cleared (Resolved) */}
        <button
          onClick={() => setActiveBucket('Cleared')}
          className={`p-4 rounded-xl border text-left transition-all ${
            activeBucket === 'Cleared'
              ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-600 shadow-xs'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Cleared (Resolved)
              </span>
            </div>
            <span className="font-mono text-xl font-bold text-emerald-600">
              {clearedComplaints.length}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Successfully closed grievances with verification remarks logged by secretaries.
          </p>
        </button>

        {/* Bucket 3: Others (Active / Within SLA) */}
        <button
          onClick={() => setActiveBucket('Others')}
          className={`p-4 rounded-xl border text-left transition-all ${
            activeBucket === 'Others'
              ? 'border-[#0A192F] bg-blue-50/50 ring-2 ring-[#0A192F] shadow-xs'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-[#0A192F] flex items-center justify-center font-bold">
                <ListFilter className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Others (In SLA Window)
              </span>
            </div>
            <span className="font-mono text-xl font-bold text-[#0A192F]">
              {othersComplaints.length}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Active investigations progressing normally within hardcoded institutional deadlines.
          </p>
        </button>
      </div>

      {/* Active Bucket Table View */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              {activeBucket} Complaints ({currentComplaints.length})
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Showing all department cases · Level 2 Authority Access
          </span>
        </div>

        {currentComplaints.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            No complaints found in the <span className="font-bold">{activeBucket}</span> category.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {currentComplaints.map((complaint) => {
              const sla = formatSLARemaining(complaint);
              const overdue = isComplaintOverdue(complaint);
              const student = getMaskedStudentInfo(complaint, currentUser);

              return (
                <div
                  key={complaint.id}
                  className={`p-5 transition-colors hover:bg-slate-50/80 flex flex-col md:flex-row md:items-start justify-between gap-4 ${
                    overdue ? 'bg-red-50/15' : ''
                  }`}
                >
                  <div className="space-y-2 flex-1">
                    {/* Meta headers */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono font-bold text-[#0A192F]">
                        {complaint.trackingId}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-slate-700">
                        {complaint.categoryName} {complaint.subOption ? `(${complaint.subOption})` : ''}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{complaint.domain.replace('_', ' ')}</span>

                      {/* Escalation alert */}
                      {complaint.escalatedToLevel2 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded">
                            <MailWarning className="w-3 h-3" />
                            Escalated to Warden
                          </span>
                        </>
                      )}

                      {/* Confidentiality tag with unmask notice */}
                      {complaint.isConfidential && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            <Eye className="w-3 h-3 text-emerald-600" />
                            Confidential (Unmasked for Warden)
                          </span>
                        </>
                      )}
                    </div>

                    <h3
                      onClick={() => onSelectComplaint(complaint)}
                      className="text-sm font-bold text-slate-900 hover:text-[#0A192F] cursor-pointer"
                    >
                      {complaint.title}
                    </h3>

                    <p className="text-xs text-slate-600 line-clamp-2">{complaint.description}</p>

                    {/* Student Identity and Assigned Secretary */}
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                      <div className="flex items-center gap-1.5 font-medium text-slate-800">
                        <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                        <span>Student: {student.displayName}</span>
                        <span className="font-mono text-slate-500 font-normal">
                          ({student.displayRollNo} · {student.displayEmail})
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-slate-600">
                        <span>Assigned Secretary:</span>
                        <span className="font-semibold text-slate-800">
                          {complaint.assignedSecretaryName || 'General Desk'}
                        </span>
                      </div>

                      {complaint.locationCode && (
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-mono">{complaint.locationCode}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Zone: SLA and Inspect */}
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

                    <button
                      onClick={() => onSelectComplaint(complaint)}
                      className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#0A192F] hover:bg-[#1B3A60] rounded-lg transition-colors flex items-center gap-1"
                    >
                      <span>Review Details</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
