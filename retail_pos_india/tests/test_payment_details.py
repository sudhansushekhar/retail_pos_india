import frappe
from frappe.tests import UnitTestCase

from retail_pos_india.payment_details import (
	APPROVAL,
	CARD_TYPE,
	LAST4,
	UPI_REF,
	before_submit,
	is_card_mode,
	is_upi_mode,
	validate,
)


class Sale(frappe._dict):
	"""Just enough of a Sales Invoice for the payment checks."""

	def set(self, key, value):
		self[key] = value


def pos_sale(payments, **fields):
	return Sale({"is_pos": 1, "payments": [{"mode_of_payment": m, "amount": a} for m, a in payments], **fields})


class TestPaymentModes(UnitTestCase):
	def test_card_and_upi_modes_by_name(self):
		self.assertTrue(is_card_mode("Credit Card"))
		self.assertTrue(is_card_mode("Debit Card"))
		self.assertFalse(is_card_mode("Cash"))
		self.assertTrue(is_upi_mode("UPI"))
		self.assertFalse(is_upi_mode("Cash"))
		self.assertFalse(is_upi_mode("Cheque"))


class TestCardDetails(UnitTestCase):
	def test_last_4_digits_are_kept(self):
		sale = pos_sale([("Debit Card", 118)], **{LAST4: " 4242 "})
		validate(sale)
		self.assertEqual(sale[LAST4], "4242")

	def test_a_full_card_number_is_refused(self):
		with self.assertRaises(frappe.ValidationError):
			validate(pos_sale([("Credit Card", 118)], **{LAST4: "4242424242424242"}))

	def test_last_4_must_be_digits(self):
		for bad in ("42a2", "424", "42 42"):
			with self.subTest(bad=bad), self.assertRaises(frappe.ValidationError):
				validate(pos_sale([("Credit Card", 118)], **{LAST4: bad}))

	def test_a_card_number_in_the_approval_code_is_refused(self):
		for bad in ("4242 4242 4242 4242", "4242-4242-4242-4242", "424242424242"):
			with self.subTest(bad=bad), self.assertRaises(frappe.ValidationError):
				validate(pos_sale([("Credit Card", 118)], **{APPROVAL: bad}))

	def test_approval_code_is_kept_in_capitals(self):
		sale = pos_sale([("Credit Card", 118)], **{APPROVAL: "a1b2c3"})
		validate(sale)
		self.assertEqual(sale[APPROVAL], "A1B2C3")

	def test_rupay_is_a_card_type_and_unknown_types_are_refused(self):
		validate(pos_sale([("Debit Card", 118)], **{CARD_TYPE: "RuPay"}))
		with self.assertRaises(frappe.ValidationError):
			validate(pos_sale([("Debit Card", 118)], **{CARD_TYPE: "Maestro Gold"}))

	def test_card_details_are_cleared_when_no_card_was_used(self):
		sale = pos_sale([("Cash", 118), ("Credit Card", 0)], **{CARD_TYPE: "Visa", LAST4: "4242", APPROVAL: "A1"})
		validate(sale)
		self.assertIsNone(sale[CARD_TYPE])
		self.assertIsNone(sale[LAST4])
		self.assertIsNone(sale[APPROVAL])

	def test_a_card_payment_needs_its_last_4_at_submit(self):
		with self.assertRaises(frappe.ValidationError):
			before_submit(pos_sale([("Credit Card", 118)]))
		before_submit(pos_sale([("Credit Card", 118)], **{LAST4: "4242"}))


class TestUpiDetails(UnitTestCase):
	def test_a_12_digit_utr_is_kept(self):
		sale = pos_sale([("UPI", 59)], **{UPI_REF: "4123 4567 8901"})
		validate(sale)
		self.assertEqual(sale[UPI_REF], "412345678901")

	def test_a_wrong_utr_is_refused(self):
		for bad in ("12345", "41234567890a", "4123456789012"):
			with self.subTest(bad=bad), self.assertRaises(frappe.ValidationError):
				validate(pos_sale([("UPI", 59)], **{UPI_REF: bad}))

	def test_upi_reference_is_cleared_when_upi_was_not_used(self):
		sale = pos_sale([("Cash", 59)], **{UPI_REF: "412345678901"})
		validate(sale)
		self.assertIsNone(sale[UPI_REF])

	def test_a_upi_payment_needs_its_reference_at_submit(self):
		with self.assertRaises(frappe.ValidationError):
			before_submit(pos_sale([("UPI", 59)]))
		before_submit(pos_sale([("UPI", 59)], **{UPI_REF: "412345678901"}))


class TestOutsideThePos(UnitTestCase):
	def test_a_desk_invoice_keeps_its_details_and_needs_none(self):
		sale = Sale({"is_pos": 0, "payments": [], LAST4: "4242"})
		validate(sale)
		before_submit(sale)
		self.assertEqual(sale[LAST4], "4242")

	def test_no_details_is_fine(self):
		validate(pos_sale([("Cash", 10)]))
		before_submit(pos_sale([("Cash", 10)]))
