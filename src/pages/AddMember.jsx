import { Navigate } from "react-router-dom";

// This page was removed in favor of the AddMember modal component.
// Keep a redirect so any stray imports/routes gracefully navigate to the dashboard.
export default function AddMemberPageRedirect() {
	return <Navigate to="/" replace />;
}
