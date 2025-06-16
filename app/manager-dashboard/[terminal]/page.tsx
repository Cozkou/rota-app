"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  const router = useRouter();
  const params = useParams();
  const terminal = Number(params.terminal);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [newStaff, setNewStaff] = useState("");
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [staffToRemove, setStaffToRemove] = useState<Staff | null>(null);

  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/login");
          return;
        }

        // Fetch user role
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (profile) {
          setUserRole(profile.role);
          // Redirect if not a manager
          if (profile.role !== 'manager') {
            router.replace("/dashboard");
            return;
          }
          // User is authorized
          setIsAuthorized(true);

          // Fetch staff data
          const { data: staffData } = await supabase
            .from("staff")
            .select("*")
            .eq("terminal", String(terminal));

          if (staffData) {
            setStaff(staffData.map((s) => ({ ...s, hours: 0, shifts: Array(7).fill("") })));
          }
        }
      } catch (error) {
        console.error('Error checking auth:', error);
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    }
    checkAuth();
  }, [router, terminal]);

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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading || !isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pink-50">
        <div className="animate-spin h-8 w-8 border-4 border-pink-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-pink-100 to-pink-200 p-4">
      {/* Hamburger Menu */}
      {!isMenuOpen && (
        <div className="fixed top-6 left-6 z-50">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2 rounded-lg hover:bg-pink-100 transition-colors group"
          >
            <div className="relative w-6 h-6 flex items-center justify-center">
              <span className={`absolute h-0.5 w-6 bg-pink-600 transform transition-all duration-300 ${isMenuOpen ? 'rotate-45 translate-y-0' : '-translate-y-1.5'}`}></span>
              <span className={`absolute h-0.5 w-6 bg-pink-600 transform transition-all duration-300 ${isMenuOpen ? 'opacity-0' : 'opacity-100'}`}></span>
              <span className={`absolute h-0.5 w-6 bg-pink-600 transform transition-all duration-300 ${isMenuOpen ? '-rotate-45 translate-y-0' : 'translate-y-1.5'}`}></span>
            </div>
          </button>
        </div>
      )}

      {/* Sidebar Menu */}
      <div className={`fixed top-0 left-0 h-full w-72 bg-white/90 backdrop-blur-md shadow-xl transform transition-all duration-300 ease-in-out z-40 ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-8">
          <div className="flex justify-between items-start mb-12">
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-pink-600 tracking-wide">Manager Dashboard</h2>
              {userRole && (
                <p className="text-base text-pink-500 mt-2 font-medium">Hello {userRole}</p>
              )}
            </div>
            <div className="ml-4">
              <button
                onClick={() => setIsMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-pink-100/50 flex-shrink-0 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-pink-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="space-y-3">
            <button
              onClick={() => router.push('/manager-dashboard')}
              className="w-full text-left px-5 py-3 rounded-xl hover:bg-pink-100/50 text-pink-600 font-medium text-lg transition-all duration-300 flex items-center gap-3 group hover:translate-x-1 hover:shadow-md"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 transition-transform duration-300 group-hover:scale-110">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
              </svg>
              <span className="transition-transform duration-300 group-hover:translate-x-1">Home</span>
            </button>
            <button
              onClick={handleSignOut}
              className="w-full text-left px-5 py-3 rounded-xl hover:bg-pink-100/50 text-pink-600 font-medium text-lg transition-all duration-300 flex items-center gap-3 group hover:translate-x-1 hover:shadow-md"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 transition-transform duration-300 group-hover:scale-110">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
              </svg>
              <span className="transition-transform duration-300 group-hover:translate-x-1">Sign Out</span>
            </button>
          </div>
        </div>
      </div>

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