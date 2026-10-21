import React, { useState } from 'react';
import {
  Menu,
  X,
  Plus,
  Shield,
  Layers,
  FileCode,
  LogIn,
  LogOut,
  UserCheck,
  ChevronDown,
} from 'lucide-react';
import { IIITTCrest } from './IIITTCrest';
import { User } from '../types';

interface NavbarProps {
  currentUser: User | null;
  activeView: 'dashboard' | 'file-complaint' | 'admin-scores';
  onNavigate: (view: 'dashboard' | 'file-complaint' | 'admin-scores') => void;
  onOpenOAuthModal: () => void;
  onOpenSLAMatrix: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  activeView,
  onNavigate,
  onOpenOAuthModal,
  onOpenSLAMatrix,
  onLogout,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
      {/* Top Banner indicating IIITT Institutional Platform */}
      <div className="bg-[#0A192F] text-[11px] text-slate-300 py-1.5 px-4 sm:px-6 flex items-center justify-between">
        <span className="font-medium tracking-wide flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          Indian Institute of Information Technology Tiruchirappalli · Student Council Grievance & Redressal Platform
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenSLAMatrix}
            className="hover:text-amber-400 text-slate-300 transition-colors"
          >
            SLA Policy
          </button>
        </div>
      </div>

      {/* Main Top Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => onNavigate('dashboard')}
            className="flex items-center gap-2.5 text-left focus:outline-none cursor-pointer"
          >
            <IIITTCrest size={34} />
            <div>
              <span className="text-lg font-bold tracking-tight text-[#0A192F] leading-none block">
                Open<span className="text-[#D97706]">Ear</span>
              </span>
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 leading-none">
                IIITT Redressal
              </span>
            </div>
          </button>
        </div>

        {/* Zone 2: Navigation Links (Desktop) */}
        {currentUser && (
          <nav className="hidden lg:flex items-center gap-6 text-xs font-semibold text-slate-600">
            <button
              onClick={() => onNavigate('dashboard')}
              className={`whitespace-nowrap transition-colors py-1 cursor-pointer ${
                activeView === 'dashboard'
                  ? 'text-[#0A192F] font-bold border-b-2 border-[#D97706]'
                  : 'hover:text-[#0A192F]'
              }`}
            >
              Dashboard
            </button>

            <button
              onClick={() => onNavigate('file-complaint')}
              className={`whitespace-nowrap transition-colors py-1 cursor-pointer ${
                activeView === 'file-complaint'
                  ? 'text-[#0A192F] font-bold border-b-2 border-[#D97706]'
                  : 'hover:text-[#0A192F]'
              }`}
            >
              File Grievance
            </button>

            <button
              onClick={onOpenSLAMatrix}
              className="whitespace-nowrap hover:text-[#0A192F] transition-colors py-1 cursor-pointer"
            >
              Routing SLAs
            </button>

            {currentUser.tierLevel === 99 && (
              <button
                onClick={() => onNavigate('admin-scores')}
                className={`whitespace-nowrap transition-colors py-1 flex items-center gap-1 cursor-pointer ${
                  activeView === 'admin-scores'
                    ? 'text-[#0A192F] font-bold border-b-2 border-[#D97706]'
                    : 'hover:text-[#0A192F]'
                }`}
              >
                <Shield className="w-3.5 h-3.5 text-[#D97706]" />
                <span>SLA Penalties Audit</span>
              </button>
            )}

          </nav>
        )}

        {/* Zone 3: Active User & Actions */}
        <div className="flex items-center gap-3 shrink-0">
          {currentUser ? (
            <>
              {/* Signed-in user */}
              <div className="flex items-center gap-2 p-1.5 sm:px-3 sm:py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-left">
                <div className="w-7 h-7 rounded-md bg-[#0A192F] text-amber-400 flex items-center justify-center font-bold text-xs shrink-0">
                  {currentUser.tierLevel === 0 ? 'ST' : currentUser.tierLevel === 1 ? 'L1' : currentUser.tierLevel === 2 ? 'L2' : 'AD'}
                </div>
                <div className="hidden sm:block text-left leading-tight">
                  <div className="text-xs font-bold text-slate-900 line-clamp-1">{currentUser.name}</div>
                  <div className="text-[10px] text-[#D97706] font-medium line-clamp-1">
                    {currentUser.roleTitle.split('(')[0]}
                  </div>
                </div>
              </div>

              {/* File Grievance Primary Action */}
              <button
                onClick={() => onNavigate('file-complaint')}
                className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#0A192F] hover:bg-[#1B3A60] rounded-lg transition-colors shadow-xs shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-amber-400" />
                <span>New Grievance</span>
              </button>

              {/* Logout Button */}
              <button
                onClick={onLogout}
                className="p-2 text-slate-500 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors border border-transparent hover:border-rose-200"
                title="Sign out of institutional session"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              onClick={onOpenOAuthModal}
              className="flex items-center gap-2 py-2 px-4 bg-[#0A192F] hover:bg-[#1B3A60] text-white text-xs font-bold rounded-lg transition-all shadow-xs cursor-pointer"
            >
              <LogIn className="w-4 h-4 text-amber-300" />
              <span>Institutional Sign In</span>
            </button>
          )}

          {/* Mobile Hamburger Button */}
          {currentUser && (
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900 rounded-lg border border-slate-200 focus:outline-none"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          )}
        </div>
      </div>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && currentUser && (
        <div className="lg:hidden bg-white border-b border-slate-200 px-4 pt-2 pb-6 space-y-3">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
            <span className="text-slate-500 block">Logged in via IIITT Google SSO:</span>
            <span className="font-bold text-slate-900">{currentUser.name}</span>
            <span className="text-slate-400 block font-mono text-[11px]">{currentUser.email}</span>
          </div>

          <div className="space-y-1 text-xs font-medium text-slate-700">
            <button
              onClick={() => {
                onNavigate('dashboard');
                setMobileMenuOpen(false);
              }}
              className="w-full text-left py-2 px-3 rounded-md hover:bg-slate-100"
            >
              Dashboard
            </button>
            <button
              onClick={() => {
                onNavigate('file-complaint');
                setMobileMenuOpen(false);
              }}
              className="w-full text-left py-2 px-3 rounded-md hover:bg-slate-100 font-bold text-[#0A192F]"
            >
              File New Grievance
            </button>
            {currentUser.tierLevel === 99 && (
              <button
                onClick={() => {
                  onNavigate('admin-scores');
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left py-2 px-3 rounded-md hover:bg-slate-100"
              >
                SLA Penalties Audit (Admin)
              </button>
            )}
            <button
              onClick={() => {
                onOpenSLAMatrix();
                setMobileMenuOpen(false);
              }}
              className="w-full text-left py-2 px-3 rounded-md hover:bg-slate-100"
            >
              Routing Matrix & SLAs
            </button>
            <button
              onClick={() => {
                onLogout();
                setMobileMenuOpen(false);
              }}
              className="w-full text-left py-2 px-3 rounded-md hover:bg-rose-50 text-rose-600 font-semibold"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
