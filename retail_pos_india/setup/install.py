"""Install and keep in step: card and UPI detail fields on Sales Invoice, shown on the POS payment
screen (POS Settings > Invoice Fields).

Runs after install and after every migrate, so a site always matches this code. Safe to run
again: it creates what is missing and corrects what drifted.
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from retail_pos_india.payment_details import APPROVAL, CARD_TYPE, CARD_TYPES, LAST4, UPI_REF

PAYMENT_FIELDS = [
	{
		"fieldname": "rpi_payment_details_section",
		"label": "Card / UPI Details",
		"fieldtype": "Section Break",
		"insert_after": "payments",
		"collapsible": 1,
	},
	{
		"fieldname": CARD_TYPE,
		"label": "Card Type",
		"fieldtype": "Select",
		"options": "\n" + "\n".join(CARD_TYPES),
		"insert_after": "rpi_payment_details_section",
	},
	{
		"fieldname": LAST4,
		"label": "Card Last 4 Digits",
		"fieldtype": "Data",
		"length": 4,
		"insert_after": CARD_TYPE,
		"description": "Last 4 digits only. Never the full card number.",
	},
	{
		"fieldname": APPROVAL,
		"label": "Card Approval Code",
		"fieldtype": "Data",
		"length": 20,
		"insert_after": LAST4,
		"description": "From the card machine's slip.",
	},
	{
		"fieldname": UPI_REF,
		"label": "UPI Transaction ID",
		"fieldtype": "Data",
		"length": 12,
		"insert_after": APPROVAL,
		"description": "The 12-digit UTR / reference number on the payment confirmation.",
	},
]

# The same fields, as rows of POS Settings > Invoice Fields: what the POS payment screen shows.
POS_FIELDS = [
	{"fieldname": f["fieldname"], "label": f["label"], "fieldtype": f["fieldtype"], "options": f.get("options", "")}
	for f in PAYMENT_FIELDS
	if f["fieldtype"] != "Section Break"
]

def after_install():
	create_custom_fields({"Sales Invoice": PAYMENT_FIELDS}, update=True)
	sync_pos_fields()


def sync_pos_fields():
	"""Our rows in POS Settings > Invoice Fields, in our order; other apps' rows are kept."""
	settings = frappe.get_single("POS Settings")
	ours = {f["fieldname"] for f in POS_FIELDS}
	others = [row for row in settings.invoice_fields if row.fieldname not in ours]
	current = [row.fieldname for row in settings.invoice_fields if row.fieldname in ours]
	if current == [f["fieldname"] for f in POS_FIELDS]:
		return
	settings.invoice_fields = []
	for row in others:
		settings.append("invoice_fields", row.as_dict(no_default_fields=True))
	for field in POS_FIELDS:
		settings.append("invoice_fields", field)
	settings.save(ignore_permissions=True)


def before_uninstall():
	settings = frappe.get_single("POS Settings")
	ours = {f["fieldname"] for f in POS_FIELDS}
	settings.invoice_fields = [row for row in settings.invoice_fields if row.fieldname not in ours]
	settings.save(ignore_permissions=True)
	for field in PAYMENT_FIELDS:
		name = f"Sales Invoice-{field['fieldname']}"
		if frappe.db.exists("Custom Field", name):
			frappe.delete_doc("Custom Field", name, ignore_permissions=True)
