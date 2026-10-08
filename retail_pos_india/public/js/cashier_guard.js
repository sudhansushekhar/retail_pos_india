/*
 * Retail POS India: cashiers use the Point of Sale only.
 *
 * Loaded on every desk page (hooks.py: app_include_js). For a user who is a Cashier and has no
 * manager or admin role, any desk page other than the ones the POS flow needs sends them back to
 * the Point of Sale. Allowed: the Point of Sale page, the POS Opening Entry and POS Closing Entry
 * forms (opening and closing the counter), and print views (receipts).
 *
 * This keeps cashiers on the counter; it is not a security boundary. What a cashier may read or
 * change is still decided by their roles' permissions on the server.
 */
(() => {
	const SUPERVISOR_ROLES = ["Sales Manager", "Accounts Manager", "Stock Manager", "System Manager", "Administrator"];
	const ALLOWED_FORMS = ["POS Opening Entry", "POS Closing Entry"];

	const is_cashier_only = () => {
		const roles = frappe.user_roles || [];
		return roles.includes("Cashier") && !roles.some((r) => SUPERVISOR_ROLES.includes(r));
	};

	const allowed = (route) => {
		if (!route || !route.length) return false;
		if (route.includes("point-of-sale")) return true;
		const [view, doctype] = route;
		if ((view === "Form" || view === "List") && ALLOWED_FORMS.includes(doctype)) return true;
		if (view === "print") return true; // receipts
		return false;
	};

	let warned = false;
	const guard = () => {
		if (!is_cashier_only()) return;
		const route = frappe.get_route();
		if (allowed(route)) return;
		if (!warned) {
			frappe.show_alert({ message: __("Cashiers use the Point of Sale."), indicator: "blue" });
			warned = true;
		}
		frappe.set_route("point-of-sale");
	};

	// Only once the router has read the URL and shown a page. Checking at boot (before that) saw an
	// empty route and sent a cashier opening an allowed page, e.g. POS Closing Entry, to the POS.
	$(document).on("page-change", guard);
	frappe.router?.on?.("change", guard);
})();
