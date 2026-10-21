import React from 'react';
import {
  Clock,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Shield,
  EyeOff,
  MapPin,
  ExternalLink,
} from 'lucide-react';
import { Complaint, User } from '../types';
import { formatSLARemaining, isComplaintOverdue } from '../utils/slaHelpers';

interface StudentDashboardProps {
  currentUser: User;
  complaints: Complaint[];
  onOpenNewComplaint: () => void;
  onSelectComplaint: (complaint: Complaint) => void;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({
  currentUser,
  complaints,
  onOpenNewComplaint,
  onSelectComplaint,
}) => {
  // Complaints submitted by this student
  const studentComplaints = complaints.filter(
    (c) => c.studentId === currentUser.id || c.studentEmail.toLowerCase() === currentUser.email.toLowerCase()
  );

  const activeCount = studentComplaints.filter((c) => c.status !== 'RESOLVED').length;
  const resolvedCount = studentComplaints.filter((c) => c.status === 'RESOLVED').length;

  return (
    <div className="space-y-6">
      {/* Student Welcome Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Logged in as</span>
            <span className="font-semibold text-slate-800">{currentUser.name}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-slate-600">Roll: {currentUser.rollNumber}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">My Grievances & Trackers</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time status updates and institutional SLA countdowns for your filed complaints.
          </p>
        </div>

        <button
          onClick={onOpenNewComplaint}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#0A192F] hover:bg-[#1B3A60] text-white text-xs font-bold rounded-lg transition-colors shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Log New Grievance</span>
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-500 font-medium block">Total Filed Grievances</span>
          <div className="font-mono text-xl font-bold text-slate-900 mt-1">{studentComplaints.length}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-500 font-medium block">Under Active Investigation</span>
          <div className="font-mono text-xl font-bold text-[#D97706] mt-1">{activeCount}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-500 font-medium block">Resolved & Closed</span>
          <div className="font-mono text-xl font-bold text-emerald-600 mt-1">{resolvedCount}</div>
        </div>
      </div>

      {/* Complaints List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Your Grievance History
          </h2>
          <span className="text-xs text-slate-500">Auto-escalates to Warden upon SLA breach</span>
        </div>

        {studentComplaints.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-sm font-bold text-slate-800">No Complaints Logged</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              You haven't logged any grievances yet. If you are experiencing issues in mess, hostel, or sports, file a complaint now.
            </p>
            <button
              onClick={onOpenNewComplaint}
              className="px-4 py-2 text-xs font-bold text-white bg-[#0A192F] hover:bg-[#1B3A60] rounded-lg transition-colors"
            >
              File First Grievance
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {studentComplaints.map((complaint) => {
              const sla = formatSLARemaining(complaint);
              const overdue = isComplaintOverdue(complaint);

              return (
                <div
                  key={complaint.id}
                  className="p-5 transition-colors hover:bg-slate-50/80 flex flex-col md:flex-row md:items-start justify-between gap-4"
                >
                  <div className="space-y-2 flex-1">
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

                      {complaint.isConfidential && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            <EyeOff className="w-3 h-3" />
                            Confidential Mode Active
                          </span>
                        </>
                      )}

                      {overdue && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded">
                            <AlertTriangle className="w-3 h-3" />
                            Overdue · Escalated to Warden
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

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                      <span>Assigned: {complaint.assignedSecretaryName || 'Student Council Desk'}</span>
                      {complaint.locationCode && (
                        <div className="flex items-center gap-1 text-slate-700">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-mono">{complaint.locationCode}</span>
                        </div>
                      )}
                      <span className="font-mono text-slate-400">
                        Logged on {new Date(complaint.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-3 shrink-0">
                    <div className="text-right">
                      <span className="text-[11px] text-slate-400 block">SLA Clock</span>
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
                      className="px-3 py-1.5 text-xs font-medium text-[#0A192F] bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      View Timeline
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
