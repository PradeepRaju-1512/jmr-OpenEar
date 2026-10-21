export type RoleType =
  | 'STUDENT'
  | 'SEC_MESS'
  | 'SEC_HOSTEL_BOYS'
  | 'SEC_HOSTEL_GIRLS'
  | 'SEC_SPORTS_BOYS'
  | 'SEC_SPORTS_GIRLS'
  | 'SEC_GENERAL'
  | 'WARDEN_HOSTEL_BOYS'
  | 'WARDEN_HOSTEL_GIRLS'
  | 'WARDEN_MESS'
  | 'INCHARGE_SPORTS'
  | 'ADMIN';

export type DomainType =
  | 'MESS'
  | 'HOSTEL_BOYS'
  | 'HOSTEL_GIRLS'
  | 'SPORTS_BOYS'
  | 'SPORTS_GIRLS'
  | 'OTHERS';

export type ComplaintStatus = 'PENDING' | 'IN_PROGRESS' | 'RESOLVED';

export type PenaltyDecisionStatus = 'PENDING_REVIEW' | 'VERIFIED_APPLIED' | 'DISMISSED';

export interface User {
  id: string;
  name: string;
  email: string; // Must end with @iiitt.ac.in
  rollNumber: string; // Extracted prefix (e.g. b210042)
  role: RoleType;
  roleTitle: string;
  tierLevel: 0 | 1 | 2 | 99; // 0=Student, 1=Secretary, 2=Warden/Incharge, 99=Administrator
  domainScope?: DomainType[];
  negativePoints: number;
  gender?: 'M' | 'F' | 'O' | null;
  eligibleDomains?: DomainType[]; // domains this user may file grievances in (server-computed)
  needsProfile?: boolean; // true until the student has declared their gender
  department?: string;
}

export interface ComplaintCategory {
  id: string;
  domain: DomainType;
  domainTitle: string;
  name: string;
  subOption?: string;
  slaDays: number;
  assignedRole: RoleType;
  escalationRole: RoleType;
}

export interface StatusHistoryEvent {
  id: string;
  complaintId: string;
  previousStatus: ComplaintStatus;
  newStatus: ComplaintStatus;
  changedByUserId: string;
  changedByName: string;
  changedByRole: string;
  remarks: string;
  timestamp: string;
}

export interface EscalationAuditRecord {
  attemptedAt: string;
  recipientRole: RoleType;
  recipientEmail: string;
  delivered: boolean;
  retryCount: number;
  triggeredBy: string;
}

export interface Attachment {
  id: string;
  complaintId: string;
  uploaderId: string;
  originalFilename: string;
  contentType: string;
  fileSizeBytes: number;
  storageKey: string;
  createdAt: string;
}

export interface Complaint {
  id: string;
  trackingId: string; // Immutable, e.g. OE-2026-MESS-1A2B3C
  studentId: string;
  studentName: string;
  studentRollNo: string;
  studentEmail: string;
  isAnonymized?: boolean; // Set true when server stripped identity for Level 1 caller
  confidentialUnmasked?: boolean; // Set true for Level 2/3 unmasked view
  domain: DomainType;
  categoryName: string;
  subOption?: string;
  slaDaysSnapshot: number; // Immutable snapshot of SLA policy at time of creation
  slaDays?: number; // Backward compatibility alias
  title: string;
  description: string;
  locationCode?: string; // e.g. Mess Hall A Table 14
  isConfidential: boolean; // strips identity from Level 1
  status: ComplaintStatus;
  createdAt: string; // ISO date string
  deadline: string; // ISO date string (server-calculated)
  firstResolvedAt?: string;
  lastResolvedAt?: string;
  isReopened?: boolean;
  reopenedCount?: number;
  assignedSecretaryName?: string;
  assignedRole: RoleType;
  
  // Escalation tracking
  slaBreached?: boolean; // set by the server once the deadline was missed (visible to administrators)
  escalatedToLevel2: boolean;
  escalatedAt?: string;
  escalationHistory?: EscalationAuditRecord[];

  // Auditable Penalty Decision State: PENDING_REVIEW, VERIFIED_APPLIED, or DISMISSED
  penaltyDecision: PenaltyDecisionStatus;
  penaltyPointsAmount: number;
  penaltyVerifiedByAdmin?: string;
  penaltyVerifiedAt?: string;
  penaltyReason?: string;

  resolutionRemarks?: string;
  statusHistory?: StatusHistoryEvent[];
  attachments?: Attachment[];
}

export interface MLSuggestion {
  domain: DomainType;
  categoryName: string;
  subOption?: string;
  reason: string;
}
