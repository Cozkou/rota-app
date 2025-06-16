"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Staff = {
  id: number;
  name: string;
  terminal: number | string;
  hours: number;
  shifts: string[];
};

function parseShift(shift: string): number {
  const match = shift.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!match) return 0;
  const [ , sh, sm, eh, em ] = match.map(Number);
  const start = sh * 60 + sm;
  let end = eh * 60 + em;
  if (end < start) end += 24 * 60;
  let diff = (end - start) / 60;
  if (diff > 6) diff -= 1;
  return Math.max(0, diff);
}

export default function TerminalRotaPage() {
  const params = useParams();
  const terminal = params.terminal;
  const [staff, setStaff] = useState<Staff[]>([]);
  const [newStaff, setNewStaff] = useState("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [staffToRemove, setStaffToRemove] = useState<Staff | null>(null);

  useEffect(() => {
    async function fetchStaff() {
      setLoading(true);
      const { data, error } = await supabase
        .from("staff")
        .select("id, name, terminal")
        .eq("terminal", String(terminal));
      console.log('Fetched staff:', data, 'Error:', error);
      if (!error && data) setStaff(data.map((s: { id: number; name: string; terminal: string }) => ({ ...s, hours: 0, shifts: Array(7).fill("") })));
      setLoading(false);
    }
    fetchStaff();
  }, [terminal]);

  const recalcHours = (shifts: string[]) => shifts.reduce((sum: number, shift: string) => sum + parseShift(shift), 0);

  const handleShiftChange = (i: number, d: number, value: string) => {
    const updated = [...staff];
    updated[i].shifts[d] = value;
    updated[i].hours = recalcHours(updated[i].shifts);
    setStaff(updated);
  };

  const handleAddStaff = async () => {
    if (newStaff.trim()) {
      const { data, error } = await supabase.from("staff").insert([
        { name: newStaff.trim(), terminal: String(terminal) }
      ]).select();
      console.log('Add staff result:', data, 'Error:', error);
      if (!error && data && data.length > 0) {
        setStaff([...staff, { ...data[0], hours: 0, shifts: Array(7).fill("") }]);
        setNewStaff("");
      }
    }
  };

  const handleRemoveStaff = (person: Staff) => {
    setStaffToRemove(person);
    setShowModal(true);
  };

  const confirmRemoveStaff = async () => {
    if (staffToRemove) {
      await supabase.from("staff").delete().eq("id", staffToRemove.id);
      setStaff(staff.filter((s) => s.id !== staffToRemove.id));
      setStaffToRemove(null);
      setShowModal(false);
    }
  };

  const cancelRemoveStaff = () => {
    setStaffToRemove(null);
    setShowModal(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-pink-100 to-pink-200 p-4">
      <div className="max-w-6xl mx-auto bg-white/90 rounded-3xl shadow-2xl p-8 md:p-12">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-10 gap-6">
          <h1 className="playfair text-4xl md:text-5xl font-extrabold text-pink-600 tracking-widest drop-shadow-sm" style={{ letterSpacing: "0.15em" }}>ACCESSORIZE</h1>
          <span className="font-semibold text-pink-700 text-lg">Terminal {terminal}</span>
        </div>
        <div className="overflow-x-auto rounded-2xl shadow-md">
          {loading ? (
            <div className="text-center text-pink-600 py-10 text-lg font-semibold">Loading staff...</div>
          ) : (
            <table className="min-w-full border-separate border-spacing-0 text-sm md:text-base text-gray-800 bg-white rounded-2xl overflow-hidden">
              <thead>
                <tr className="bg-pink-200 text-pink-700 text-base">
                  <th className="border-b border-pink-100 px-4 py-3 font-bold">Name</th>
                  <th className="border-b border-pink-100 px-4 py-3 font-bold">Hours</th>
                  {days.map((day) => (
                    <th key={day} className="border-b border-pink-100 px-4 py-3 font-bold">{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staff.map((person, i) => (
                  <tr key={person.id} className={i % 2 === 0 ? "bg-white" : "bg-pink-50 hover:bg-pink-100 transition"}>
                    <td className="border-b border-pink-100 px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">{person.name}</td>
                    <td className="border-b border-pink-100 px-4 py-3 text-gray-800 text-center">{person.hours}</td>
                    {person.shifts && person.shifts.map((shift, d) => (
                      <td key={d} className="border-b border-pink-100 px-2 py-2">
                        <input
                          className="w-full px-2 py-1 border border-pink-200 rounded-lg text-sm md:text-base text-gray-800 bg-white focus:ring-2 focus:ring-pink-400 focus:border-pink-400 transition shadow-sm"
                          value={shift}
                          onChange={(e) => handleShiftChange(i, d, e.target.value)}
                          placeholder="--"
                        />
                      </td>
                    ))}
                    <td className="border-b border-pink-100 px-4 py-3 text-center">
                      <button onClick={() => handleRemoveStaff(person)} className="text-pink-500 hover:text-pink-700 font-bold text-2xl md:text-3xl transition-transform hover:scale-125 ml-2">&times;</button>
                    </td>
                  </tr>
                ))}
                {/* Inline add staff row */}
                <tr className="bg-pink-100">
                  <td className="px-4 py-3">
                    <input
                      className="w-full px-2 py-1 border border-pink-300 rounded-lg text-sm md:text-base text-gray-800 bg-white focus:ring-2 focus:ring-pink-400 focus:border-pink-400 transition shadow-sm"
                      placeholder="Add staff name"
                      value={newStaff}
                      onChange={(e) => setNewStaff(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddStaff(); }}
                    />
                  </td>
                  <td className="px-4 py-3 text-center" colSpan={days.length + 1}>
                    <button onClick={handleAddStaff} className="px-5 py-2 rounded-full bg-pink-600 text-white font-semibold shadow hover:bg-pink-700 transition">Add</button>
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
      {/* Confirmation Modal */}
      {showModal && staffToRemove && (
        <div className="fixed inset-0 flex items-center justify-center bg-white/30 backdrop-blur-sm z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-xs">
            <h3 className="text-xl font-semibold mb-4 text-gray-800">Remove Staff Member</h3>
            <p className="mb-6 text-gray-700">Are you sure you want to remove <span className="font-bold text-pink-600">{staffToRemove.name}</span>?</p>
            <div className="flex justify-end gap-3">
              <button onClick={cancelRemoveStaff} className="px-5 py-2 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 font-semibold">Cancel</button>
              <button onClick={confirmRemoveStaff} className="px-5 py-2 rounded-full bg-pink-600 text-white hover:bg-pink-700 font-semibold">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 