// Shows: "Primary Attendant : NAME" (bold, ALL CAPS) on the left,
// and "SATURDAY, November 1, 2025" on the right.

export default function Topbar({ attendant = "KIM ARCEO" }){
  const now = new Date();

  // Day name in ALL CAPS
  const day = now.toLocaleDateString(undefined, { weekday: "long" }).toUpperCase();

  // Month Day, Year (with month spelled out)
  const rest = now.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="topbar">
      <div className="attendant">
        Primary Attendant : {String(attendant).toUpperCase()}
      </div>
      <div className="date">
        {day}, {rest}
      </div>
    </div>
  );
}
