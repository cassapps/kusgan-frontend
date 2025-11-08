// Page proxy: re-export the canonical ProgressDetailPanel component. The
// component itself is route-aware (uses useParams internally) so importing
// it directly from routes is safe.
import { Navigate } from "react-router-dom";

// Progress detail moved into a modal. Redirect to dashboard if route used.
export default function ProgressDetailRedirect() {
	return <Navigate to="/" replace />;
}
