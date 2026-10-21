import { Complaint, User } from '../types';

export function isComplaintOverdue(complaint: Complaint): boolean {
  if (complaint.status === 'RESOLVED') return false;
  return new Date() > new Date(complaint.deadline);
}

export function formatSLARemaining(complaint: Complaint): {
  label: string;
  isOverdue: boolean;
  severity: 'normal' | 'warning' | 'overdue' | 'resolved';
} {
  if (complaint.status === 'RESOLVED') {
    const resolvedAt = complaint.lastResolvedAt ? new Date(complaint.lastResolvedAt).getTime() : null;
    const late = resolvedAt !== null && resolvedAt > new Date(complaint.deadline).getTime();
    return {
      label: late ? 'Resolved after the deadline' : 'Resolved within deadline',
      isOverdue: false,
      severity: 'resolved',
    };
  }

  const now = new Date().getTime();
  const deadline = new Date(complaint.deadline).getTime();
  const diffMs = deadline - now;

  if (diffMs < 0) {
    const overdueMs = Math.abs(diffMs);
    const days = Math.floor(overdueMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((overdueMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return {
      label: `Overdue by ${days > 0 ? `${days}d ` : ''}${hours}h`,
      isOverdue: true,
      severity: 'overdue',
    };
  }

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days === 0 && hours < 24) {
    return {
      label: `${hours}h remaining`,
      isOverdue: false,
      severity: 'warning',
    };
  }

  return {
    label: `${days}d ${hours}h remaining`,
    isOverdue: false,
    severity: 'normal',
  };
}

/**
 * Confidentiality is enforced by the server: when it hides an identity it sets `isAnonymized`
 * and sends placeholder values. This helper only decides how to present what the server sent.
 */
export function getMaskedStudentInfo(
  complaint: Complaint,
  currentUser: User | null
): {
  displayName: string;
  displayRollNo: string;
  displayEmail: string;
  isMasked: boolean;
  unmaskedPrivilege: boolean;
} {
  if (complaint.isAnonymized) {
    return {
      displayName: 'Anonymous Student',
      displayRollNo: 'PROTECTED-ROLL-NO',
      displayEmail: 'confidential@iiitt.ac.in',
      isMasked: true,
      unmaskedPrivilege: false,
    };
  }

  const isOwner = !!currentUser && currentUser.id === complaint.studentId;
  return {
    displayName: isOwner ? `${complaint.studentName} (You)` : complaint.studentName,
    displayRollNo: complaint.studentRollNo,
    displayEmail: complaint.studentEmail,
    isMasked: false,
    unmaskedPrivilege: !!complaint.confidentialUnmasked,
  };
}
