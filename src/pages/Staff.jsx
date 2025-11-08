import { Navigate } from "react-router-dom";

// Staff page removed — staff UI is now handled via modals/panels. Redirect.
export default function StaffPageRedirect() {
	return <Navigate to="/" replace />;
}
