// Simple localStorage-backed store for members, payments, and gym entries

const KEY = "kusgan.members.v1";

function seedIfEmpty() {
  const existing = localStorage.getItem(KEY);
  if (existing) return JSON.parse(existing);

  const today = new Date();
  const iso = (d) => d.toISOString();

  // helper to add days
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };

  const members = [
    {
      id: "M001",
      nickname: "ELMER",
      firstName: "Elmer",
      lastName: "Reyes",
      middleName: "",
      birthday: "1990-05-12",
      gender: "Male",
      memberDate: "2024-11-15",
      lastVisit: "2025-10-30",
      gymActive: true,
      coachSubscription: "Available", // or "-"
      coachName: "Coach ELMER",
      photoUrl: "",

      payments: [
        {
          date: "2025-10-01",
          particulars: "Gym Membership",
          startDate: "2025-10-01",
          endDate: "2025-10-31",
          amount: 1200,
          mode: "Cash",
        },
      ],
      entries: [
        {
          date: "2025-10-30",
          timeIn: "08:10 AM",
          timeOut: "09:30 AM",
          totalHours: 1.33,
          coach: true,
          coachName: "Coach ELMER",
        },
      ],
    },
    {
      id: "M002",
      nickname: "KIM",
      firstName: "Kim",
      lastName: "Arceo",
      middleName: "D.",
      birthday: "1996-02-18",
      gender: "Female",
      memberDate: "2025-01-05",
      lastVisit: "2025-10-29",
      gymActive: false,
      coachSubscription: "-",
      coachName: "",
      photoUrl: "",
      payments: [
        {
          date: "2025-06-01",
          particulars: "Gym Membership",
          startDate: "2025-06-01",
          endDate: "2025-06-30",
          amount: 1200,
          mode: "GCash",
        },
        {
          date: "2025-06-01",
          particulars: "Coach Subscription",
          startDate: "2025-06-01",
          endDate: "2025-06-30",
          amount: 2000,
          mode: "GCash",
        },
      ],
      entries: [],
    },
  ];

  localStorage.setItem(KEY, JSON.stringify(members));
  return members;
}

export function getMembers() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || seedIfEmpty();
  } catch {
    return seedIfEmpty();
  }
}

export function saveMembers(members) {
  localStorage.setItem(KEY, JSON.stringify(members));
}

export function getMemberById(id) {
  return getMembers().find((m) => m.id === id);
}

export function addMember(member) {
  const all = getMembers();
  all.push(member);
  saveMembers(all);
}

export function updateMember(id, patch) {
  const all = getMembers().map((m) => (m.id === id ? { ...m, ...patch } : m));
  saveMembers(all);
}

export function getMemberPayments(id) {
  const m = getMemberById(id);
  return m?.payments ?? [];
}

export function getMemberEntries(id) {
  const m = getMemberById(id);
  return m?.entries ?? [];
}

export function getMemberProgress(id) {
  const m = getMemberById(id);
  return m?.progress ?? [];
}
