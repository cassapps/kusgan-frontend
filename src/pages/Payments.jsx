import { Navigate } from "react-router-dom";

// Payments page removed — payments are handled in a modal.
export default function PaymentsPageRedirect() {
	return <Navigate to="/" replace />;
}
