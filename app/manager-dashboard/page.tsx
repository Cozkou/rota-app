"use client";

import { useState, Fragment } from "react";
import { useRouter } from "next/navigation";

const initialStaff = [
  { name: "LOVEJOY LEGASPI", hours: 40, shifts: ["D/O", "05:30-14:30", "05:30-14:30", "D/O", "05:30-14:30", "05:30-14:30", "05:30-14:30"] },
  { name: "ROSHA RODRIGUES", hours: 40, shifts: ["05:30-14:30", "13:30-22:30", "11:30-14:30", "D/O", "D/O", "05:30-14:30", "13:30-22:30"] },
  { name: "MARIA MIRZAN", hours: 40, shifts: ["13:30-22:30", "D/O", "13:30-22:30", "13:30-22:30", "13:30-22:30", "13:30-22:30", "13:00-22:00"] },
];

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function parseShift(shift: string): number {
  // Expects format 'HH:MM-HH:MM'
  const match = shift.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!match) return 0;
  const [ , sh, sm, eh, em ] = match.map(Number);
  let start = sh * 60 + sm;
  let end = eh * 60 + em;
  if (end < start) end += 24 * 60; // handle overnight
  let diff = (end - start) / 60;
  if (diff > 6) diff -= 1; // 1 hour break for shifts > 6h
  return Math.max(0, diff);
}

const terminals = [2, 3, 4, 5];

export default function ManagerDashboardHome() {
  const router = useRouter();
  const [staff, setStaff] = useState(initialStaff);
  const [newStaff, setNewStaff] = useState("");
  const [week, setWeek] = useState(0); // 0 = current week
  const [showModal, setShowModal] = useState(false);
  const [staffToRemove, setStaffToRemove] = useState<number | null>(null);

  // Helper to recalculate hours for a staff member
  const recalcHours = (shifts: string[]) => {
    return shifts.reduce((sum, shift) => sum + parseShift(shift), 0);
  };

  const handleShiftChange = (i: number, d: number, value: string) => {
    const updated = [...staff];
    updated[i].shifts[d] = value;
    updated[i].hours = recalcHours(updated[i].shifts);
    setStaff(updated);
  };

  const handleAddStaff = () => {
    if (newStaff.trim()) {
      setStaff([
        ...staff,
        { name: newStaff.trim().toUpperCase(), hours: 0, shifts: Array(7).fill("") },
      ]);
      setNewStaff("");
    }
  };

  const handleRemoveStaff = (i: number) => {
    setStaffToRemove(i);
    setShowModal(true);
  };

  const confirmRemoveStaff = () => {
    if (staffToRemove !== null) {
      setStaff(staff.filter((_, idx) => idx !== staffToRemove));
      setStaffToRemove(null);
      setShowModal(false);
    }
  };

  const cancelRemoveStaff = () => {
    setStaffToRemove(null);
    setShowModal(false);
  };

  const handleWeekChange = (offset: number) => {
    setWeek((w) => Math.max(0, Math.min(3, w + offset)));
    // In a real app, fetch data for the selected week here
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-pink-50 via-pink-100 to-pink-200 p-4">
      <h1 className="playfair text-4xl md:text-5xl font-extrabold text-pink-600 tracking-widest mb-10" style={{ letterSpacing: "0.15em" }}>ACCESSORIZE</h1>
      <div className="bg-white/90 rounded-3xl shadow-2xl p-8 md:p-12 w-full max-w-lg flex flex-col items-center">
        <h2 className="text-2xl font-bold text-pink-700 mb-8">Select Terminal</h2>
        <div className="w-full flex flex-col gap-6">
          {terminals.map((terminal) => (
            <button
              key={terminal}
              onClick={() => router.push(`/manager-dashboard/${terminal}`)}
              className="w-full py-6 rounded-xl bg-pink-100 hover:bg-pink-200 text-pink-700 text-2xl font-bold shadow transition"
            >
              Terminal {terminal}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
} 