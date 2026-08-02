import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, Check, ArrowRight } from 'lucide-react';

interface CustomDateRangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  startDate: string;
  endDate: string;
  onApply: (startDate: string, endDate: string) => void;
}

const formatDateStr = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseDateStr = (str: string) => {
  if (!str) return new Date();
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const CustomDateRangeModal: React.FC<CustomDateRangeModalProps> = ({
  isOpen,
  onClose,
  startDate,
  endDate,
  onApply,
}) => {
  const [tempStart, setTempStart] = useState<string | null>(startDate || null);
  const [tempEnd, setTempEnd] = useState<string | null>(endDate || null);
  const [isSelectingEnd, setIsSelectingEnd] = useState<boolean>(false);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  // Month navigation view
  const initialViewDate = startDate ? parseDateStr(startDate) : new Date();
  const [viewYear, setViewYear] = useState<number>(initialViewDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initialViewDate.getMonth());

  useEffect(() => {
    if (isOpen) {
      const s = startDate || formatDateStr(new Date());
      const e = endDate || s;
      setTempStart(s);
      setTempEnd(e);
      setIsSelectingEnd(false);
      const vDate = parseDateStr(s);
      setViewYear(vDate.getFullYear());
      setViewMonth(vDate.getMonth());
    }
  }, [isOpen, startDate, endDate]);

  if (!isOpen) return null;

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(prev => prev - 1);
    } else {
      setViewMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(prev => prev + 1);
    } else {
      setViewMonth(prev => prev + 1);
    }
  };

  const handleDateClick = (dateStr: string) => {
    if (!tempStart || !isSelectingEnd) {
      // Step 1: First click sets Start Date
      setTempStart(dateStr);
      setTempEnd(null);
      setIsSelectingEnd(true);
    } else {
      // Step 2: Second click sets End Date (if >= start)
      if (dateStr < tempStart) {
        setTempStart(dateStr);
        setTempEnd(null);
        setIsSelectingEnd(true);
      } else {
        setTempEnd(dateStr);
        setIsSelectingEnd(false);
      }
    }
  };

  const setPreset = (preset: 'today' | 'yesterday' | 'week' | 'month' | 'lastMonth') => {
    const today = new Date();
    let s = new Date();
    let e = new Date();

    if (preset === 'today') {
      s = today;
      e = today;
    } else if (preset === 'yesterday') {
      s = new Date(today.getTime() - 86400000);
      e = s;
    } else if (preset === 'week') {
      const day = today.getDay();
      const diff = day === 0 ? 6 : day - 1;
      s = new Date(today.getFullYear(), today.getMonth(), today.getDate() - diff);
      e = today;
    } else if (preset === 'month') {
      s = new Date(today.getFullYear(), today.getMonth(), 1);
      e = today;
    } else if (preset === 'lastMonth') {
      s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      e = new Date(today.getFullYear(), today.getMonth(), 0);
    }

    const startStr = formatDateStr(s);
    const endStr = formatDateStr(e);
    setTempStart(startStr);
    setTempEnd(endStr);
    setIsSelectingEnd(false);
    setViewYear(s.getFullYear());
    setViewMonth(s.getMonth());
  };

  // Calendar rendering math
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const daysArray = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    daysArray.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(viewYear, viewMonth, d);
    daysArray.push(formatDateStr(dateObj));
  }

  // Active hover/selection range calculation
  const activeStart = tempStart;
  const activeEnd = tempEnd || (isSelectingEnd ? hoverDate : tempStart);
  
  let effectiveMin = activeStart;
  let effectiveMax = activeEnd;
  if (activeStart && activeEnd && activeStart > activeEnd) {
    effectiveMin = activeEnd;
    effectiveMax = activeStart;
  }

  const handleApply = () => {
    const finalStart = tempStart || formatDateStr(new Date());
    const finalEnd = tempEnd || tempStart || finalStart;
    const sortedStart = finalStart < finalEnd ? finalStart : finalEnd;
    const sortedEnd = finalStart < finalEnd ? finalEnd : finalStart;
    onApply(sortedStart, sortedEnd);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 border border-slate-100 flex flex-col md:flex-row">
        
        {/* Sidebar Presets */}
        <div className="bg-slate-50 p-4 border-b md:border-b-0 md:border-r border-slate-100 flex flex-row md:flex-col gap-1 overflow-x-auto shrink-0 min-w-[140px]">
          <p className="hidden md:block text-[10px] font-black text-slate-400 uppercase tracking-wider px-3 mb-2">Shortcuts</p>
          <button 
            onClick={() => setPreset('today')}
            className="px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/60 rounded-xl text-left transition-colors whitespace-nowrap"
          >
            Today
          </button>
          <button 
            onClick={() => setPreset('yesterday')}
            className="px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/60 rounded-xl text-left transition-colors whitespace-nowrap"
          >
            Yesterday
          </button>
          <button 
            onClick={() => setPreset('week')}
            className="px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/60 rounded-xl text-left transition-colors whitespace-nowrap"
          >
            This Week
          </button>
          <button 
            onClick={() => setPreset('month')}
            className="px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/60 rounded-xl text-left transition-colors whitespace-nowrap"
          >
            This Month
          </button>
          <button 
            onClick={() => setPreset('lastMonth')}
            className="px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/60 rounded-xl text-left transition-colors whitespace-nowrap"
          >
            Last Month
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 p-5 flex flex-col">
          {/* Header */}
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2 text-brand-primary">
              <CalendarIcon size={18} />
              <h3 className="font-black text-slate-800 text-base">Select Custom Dates</h3>
            </div>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-all">
              <X size={18} />
            </button>
          </div>

          {/* Interactive Hint Badge */}
          <div className="mb-3 px-3 py-1.5 bg-brand-50 border border-brand-100 rounded-xl text-xs font-bold text-brand-700 flex items-center justify-between">
            <span>
              {isSelectingEnd 
                ? '👉 Step 2: Now click your END date' 
                : '👉 Step 1: Click START date (or double-click one date for single day)'}
            </span>
          </div>

          {/* Month Header Nav */}
          <div className="flex justify-between items-center mb-3 bg-slate-50 px-3 py-2 rounded-2xl border border-slate-100">
            <button onClick={handlePrevMonth} className="p-1 text-slate-600 hover:bg-white rounded-lg shadow-sm transition-all">
              <ChevronLeft size={16} />
            </button>
            <span className="font-black text-slate-800 text-sm">
              {monthNames[viewMonth]} {viewYear}
            </span>
            <button onClick={handleNextMonth} className="p-1 text-slate-600 hover:bg-white rounded-lg shadow-sm transition-all">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Days of Week Header */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {daysOfWeek.map((day, i) => (
              <span key={i} className="text-[11px] font-black text-slate-400 uppercase">
                {day}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-y-1 gap-x-0 text-center mb-4">
            {daysArray.map((dateStr, idx) => {
              if (!dateStr) {
                return <div key={`empty-${idx}`} className="h-9" />;
              }

              const isStart = dateStr === tempStart;
              const isEnd = dateStr === tempEnd;
              const isSingle = isStart && (isEnd || (!tempEnd && !isSelectingEnd));
              const inRange = effectiveMin && effectiveMax && dateStr >= effectiveMin && dateStr <= effectiveMax;
              const dayNum = parseInt(dateStr.split('-')[2], 10);

              let bgClass = "hover:bg-slate-100 text-slate-700 font-bold rounded-lg";
              if (isSingle) {
                bgClass = "bg-brand-primary text-white font-black rounded-xl shadow-md shadow-brand-primary/30 scale-105 z-10";
              } else if (isStart) {
                bgClass = "bg-brand-primary text-white font-black rounded-l-xl shadow-sm z-10";
              } else if (isEnd) {
                bgClass = "bg-brand-primary text-white font-black rounded-r-xl shadow-sm z-10";
              } else if (inRange) {
                bgClass = "bg-brand-50 text-brand-800 font-bold rounded-none";
              }

              return (
                <button
                  key={dateStr}
                  onClick={() => handleDateClick(dateStr)}
                  onMouseEnter={() => {
                    if (isSelectingEnd) setHoverDate(dateStr);
                  }}
                  onMouseLeave={() => setHoverDate(null)}
                  className={`h-9 w-full flex items-center justify-center text-xs transition-all relative ${bgClass}`}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>

          {/* Footer Info & Action */}
          <div className="mt-auto pt-3 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="text-xs font-bold text-slate-600 flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
              {tempStart ? (
                <>
                  <span className="text-brand-700 font-black">{tempStart}</span>
                  {tempEnd && tempEnd !== tempStart ? (
                    <>
                      <ArrowRight size={12} className="text-slate-400" />
                      <span className="text-brand-700 font-black">{tempEnd}</span>
                    </>
                  ) : (
                    <span className="text-slate-400 font-normal">(Single Day)</span>
                  )}
                </>
              ) : (
                <span className="text-slate-400">Click a date to begin</span>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={onClose}
                className="flex-1 sm:flex-none px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={!tempStart}
                className="flex-1 sm:flex-none px-5 py-2 bg-brand-primary hover:bg-brand-secondary text-white text-xs font-black rounded-xl transition-all shadow-lg shadow-brand-primary/20 flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Check size={14} /> Apply Range
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

export default CustomDateRangeModal;
