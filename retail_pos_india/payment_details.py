"""Payment details on a POS sale: only what is safe to keep.

Card: the card machine handles the card; the POS records the card type, the LAST 4 digits and
the approval code from the machine's slip. A full card number, expiry date or CVV is never
stored (PCI DSS), so these checks refuse anything that looks like one.

UPI: the POS records the UPI transaction ID (UTR / RRN, 12 digits) shown on the payment
confirmation, so the payment can be traced.

A payment mode counts as a card if its name contains "card" (Debit Card, Credit Card), and as
UPI if its name is or contains the word "UPI". The same rule is used on the POS screen.
"""

import re

import frappe
from frappe import _

CARD_TYPES = ("Visa", "Mastercard", "RuPay", "Amex", "Diners Club", "Other")

# Custom fields this app adds to Sales Invoice (created by setup/install.py).
CARD_TYPE = "rpi_card_type"
LAST4 = "rpi_card_last4"
APPROVAL = "rpi_card_approval_code"
UPI_REF = "rpi_upi_reference"
CARD_FIELDS = (CARD_TYPE, LAST4, APPROVAL)


def is_card_mode(mode_of_payment):
	return bool(re.search(r"card", mode_of_payment or "", re.IGNORECASE))


def is_upi_mode(mode_of_payment):
	return bool(re.search(r"\bupi\b", mode_of_payment or "", re.IGNORECASE))


def paid_by(doc, is_mode):
	return any(is_mode(row.get("mode_of_payment")) and (row.get("amount") or 0) > 0 for row in doc.get("payments") or [])


def validate(doc, method=None):
	if doc.get("is_pos"):
		# Details of a payment mode the sale did not use are cleared, not kept by mistake.
		if not paid_by(doc, is_card_mode):
			for field in CARD_FIELDS:
				doc.set(field, None)
		if not paid_by(doc, is_upi_mode):
			doc.set(UPI_REF, None)

	last4 = (doc.get(LAST4) or "").strip()
	if last4:
		if not re.fullmatch(r"\d{4}", last4):
			frappe.throw(
				_("Card last 4 digits must be exactly 4 digits. Never enter the full card number."),
				title=_("Card details"),
			)
		doc.set(LAST4, last4)

	approval = (doc.get(APPROVAL) or "").strip()
	if approval:
		# An approval code is short (usually 6 characters). A long run of digits is a card number.
		if re.search(r"\d{12,}", re.sub(r"[\s-]", "", approval)):
			frappe.throw(
				_("That looks like a card number. Enter only the approval code from the card machine's slip."),
				title=_("Card details"),
			)
		doc.set(APPROVAL, approval.upper())

	if doc.get(CARD_TYPE) and doc.get(CARD_TYPE) not in CARD_TYPES:
		frappe.throw(_("Card type must be one of: {0}").format(", ".join(CARD_TYPES)), title=_("Card details"))

	upi = re.sub(r"\s", "", doc.get(UPI_REF) or "")
	if upi:
		if not re.fullmatch(r"\d{12}", upi):
			frappe.throw(_("UPI transaction ID (UTR) must be 12 digits."), title=_("UPI details"))
		doc.set(UPI_REF, upi)


def before_submit(doc, method=None):
	"""At Complete Order: a card or UPI payment must carry its reference."""
	if not doc.get("is_pos"):
		return
	if paid_by(doc, is_card_mode) and not doc.get(LAST4):
		frappe.throw(_("Enter the card's last 4 digits for the card payment."), title=_("Card details"))
	if paid_by(doc, is_upi_mode) and not doc.get(UPI_REF):
		frappe.throw(_("Enter the UPI transaction ID (UTR) for the UPI payment."), title=_("UPI details"))
