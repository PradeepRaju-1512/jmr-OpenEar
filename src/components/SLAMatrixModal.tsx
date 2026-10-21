import React from 'react';
import { X, Clock, Shield, ArrowRight } from 'lucide-react';
import { COMPLAINT_CATEGORIES } from '../data/categories';

interface SLAMatrixModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SLAMatrixModal: React.FC<SLAMatrixModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const sections = [
    {
      title: '1. Mess (Combined for Boys & Girls)',
      desc: 'Routed directly to Mess Secretaries. Escalates to Mess Warden on SLA breach.',
      items: [
        { cat: 'Hygiene', sla: '3 Days' },
        { cat: 'Food Quality', sla: '3 Days' },
        { cat: 'Utensils and Related Items', sla: '5 Days' },
        { cat: 'Mess Maintenance', sla: '3 Days' },
      ],
    },
    {
      title: "2. Hostel (Split by Gender: Boys' & Girls' Wings)",
      desc: "Routed to respective Hostel Secretaries. Escalates to Boys'/Girls' Hostel Wardens.",
      items: [
        { cat: 'Wifi Access Points', sla: '5 Days' },
        { cat: 'Drinking Water & Aquaguards', sla: '5 Days' },
        { cat: 'Water Supply & Plumbing', sla: '5 Days' },
        { cat: 'Room & Corridor Cleaning', sla: '5 Days' },
        { cat: 'Washrooms & Sanitation', sla: '5 Days' },
        { cat: 'Washing Machines & Laundry', sla: '5 Days' },
        { cat: 'Custom Room Grievances', sla: '5 Days' },
      ],
    },
    {
      title: '3. Sports (Split by Gender)',
      desc: 'Routed to Sports Secretaries. Escalates to Sports Incharge.',
      items: [
        { cat: 'Indoor (Table tennis, Chess, Carroms, Badminton)', sla: '7 Days' },
        { cat: 'Outdoor (Volleyball, Football, Cricket, Kho kho, Kabaddi)', sla: '7 Days' },
      ],
    },
    {
      title: '4. General Secretary',
      desc: 'Describe the issue in your own words. Routed to the General Secretary (currently open to boys only). Escalates to the system administrators.',
      items: [
        { cat: 'Any general campus matter', sla: '5 Days' },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-[#0A192F] px-6 py-4 text-white flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold">IIITT Institutional Complaint & SLA Routing Matrix</h2>
            <p className="text-xs text-amber-300">
              Hardcoded resolution turnaround limits enforced across all student council sectors
            </p>
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
          {sections.map((sec) => (
            <div key={sec.title} className="space-y-2">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                {sec.title}
              </h3>
              <p className="text-xs text-slate-500">{sec.desc}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                {sec.items.map((it) => (
                  <div
                    key={it.cat}
                    className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between text-xs"
                  >
                    <span className="font-medium text-slate-800">{it.cat}</span>
                    <span className="font-mono font-bold text-[#D97706] bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      {it.sla} SLA
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
