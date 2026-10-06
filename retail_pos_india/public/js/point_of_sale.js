/*
 * Retail POS India for ERPNext's Point of Sale page.
 *
 * Loaded after ERPNext's own point_of_sale.js (hooks.py: page_js). ERPNext loads the POS classes
 * later, from point-of-sale.bundle.js, so this wraps on_page_load: load the bundle, patch the
 * classes, then let ERPNext build the page as usual.
 *
 *  1. Number pad takes whole amounts: tap 5 0 0 for 500.00 (ERPNext's own pad enters cents,
 *     so 5 0 0 would be 5.00). A "." key replaces "+/-" for decimals: 1 2 . 5 is 12.50.
 *  2. A wider cart: the screen is 10 columns; ERPNext gives the cart 4, this gives it 5.
 *  3. Card and UPI details (POS Settings > Invoice Fields) as inputs on the payment screen, shown
 *     only for the payment that needs them: card fields for a card mode, the UPI transaction ID
 *     for UPI (a mode is a card if its name contains "card", UPI if it contains the word "UPI";
 *     the same rule as payment_details.py on the server).
 *  4. A tap anywhere on a payment mode's tile selects it (ERPNext ignored taps on its amount),
 *     and ERPNext's automatic selection of the default mode no longer undoes the cashier's tap.
 *  5. The opening dialog lists only the cash payment mode (the drawer's opening balance), with no
 *     row checkboxes, Delete row or Duplicate row.
 */
(() => {
	const page = frappe.pages["point-of-sale"];
	const erpnext_on_page_load = page.on_page_load;

	page.on_page_load = function (wrapper) {
		frappe.require("point-of-sale.bundle.js", () => {
			patch_opening(erpnext.PointOfSale.Controller.prototype);
			patch_payment(erpnext.PointOfSale.Payment.prototype);
			add_styles();
			erpnext_on_page_load.call(this, wrapper);
		});
	};

	// The opening dialog ("Create POS Opening Entry") lists only CASH modes: the opening balance is
	// the cash in the drawer, not UPI or card money. ERPNext fills the table with every payment
	// mode of the profile inside a closure, so this filters the rows just before the table draws.
	// A mode is cash if its name contains "cash" (the same naming rule as card and UPI).
	function patch_opening(Controller) {
		if (Controller.__rpi) return;
		Controller.__rpi = true;
		const erpnext_create_opening_voucher = Controller.create_opening_voucher;
		Controller.create_opening_voucher = function (...args) {
			// Catch the dialog as ERPNext creates it (cur_dialog is set only later, once it shows).
			const Dialog = frappe.ui.Dialog;
			let dialog;
			frappe.ui.Dialog = class extends Dialog {
				constructor(...dialog_args) {
					super(...dialog_args);
					dialog = dialog || this;
				}
			};
			let out;
			try {
				out = erpnext_create_opening_voucher.apply(this, args);
			} finally {
				frappe.ui.Dialog = Dialog;
			}
			const table = dialog?.fields_dict?.balance_details;
			if (!table) return out;
			// No row checkboxes, Delete row or Duplicate row here (CSS, scoped to this dialog):
			// the checkbox only picked rows for those buttons; every row is submitted anyway.
			dialog.$wrapper.addClass("rpi-opening");
			table.df.cannot_delete_rows = 1;
			const erpnext_refresh = table.grid.refresh.bind(table.grid);
			table.grid.refresh = (...refresh_args) => {
				const rows = table.df.data || [];
				const cash = rows.filter((r) => /cash/i.test(r.mode_of_payment || ""));
				if (cash.length && cash.length !== rows.length) table.df.data = cash;
				return erpnext_refresh(...refresh_args);
			};
			return out;
		};
	}

	function patch_payment(Payment) {
		if (Payment.__rpi) return;
		Payment.__rpi = true;

		// The pad's bottom row: "." instead of "+/-".
		Payment.initialize_numpad = function () {
			const me = this;
			this.number_pad = new erpnext.PointOfSale.NumberPad({
				wrapper: this.$numpad,
				events: {
					numpad_event: ($btn) => me.on_numpad_clicked($btn),
				},
				cols: 3,
				keys: [
					[1, 2, 3],
					[4, 5, 6],
					[7, 8, 9],
					[".", 0, "Delete"],
				],
			});
			this.numpad_value = "";
		};

		// POS Settings > Invoice Fields (our card fields) shown as inputs on the payment screen,
		// instead of behind ERPNext's "Update Additional Information" button and dialog.
		const erpnext_make_invoice_field_dialog = Payment.make_invoice_field_dialog;
		Payment.make_invoice_field_dialog = function (...args) {
			const out = erpnext_make_invoice_field_dialog.apply(this, args);
			if (!this.invoice_fields || !this.invoice_fields.length) return out;

			const frm = this.events.get_frm();
			this.$invoice_fields_section.find(".addl-fields").addClass("hidden");
			// Under the payment buttons (left column), where there is room: the right column
			// belongs to the number pad, and on a short screen the fields were squeezed there.
			const $left = this.$component.find(".payment-container-left");
			$left.find(".rpi-fields").remove();
			const $body = $('<div class="rpi-fields"></div>').appendTo($left);

			const group = new frappe.ui.FieldGroup({
				body: $body,
				fields: this.invoice_fields.map((df) => ({
					fieldname: df.fieldname,
					label: __(df.label),
					fieldtype: df.fieldtype,
					options: df.options,
					reqd: df.reqd,
					read_only: df.read_only,
					onchange: () => frm.set_value(df.fieldname, group.get_value(df.fieldname)),
				})),
			});
			group.make();
			for (const df of this.invoice_fields) {
				if (frm.doc[df.fieldname]) group.set_value(df.fieldname, frm.doc[df.fieldname]);
			}
			// The last-4 box takes at most 4 characters, the UPI ID 12 (the server also checks both).
			group.fields_dict.rpi_card_last4?.$input.attr({ maxlength: 4, inputmode: "numeric" });
			group.fields_dict.rpi_upi_reference?.$input.attr({ maxlength: 12, inputmode: "numeric" });
			this.rpi_fields = group;
			this.rpi_fields_box = $body;
			this.__rpi_last_mode = null;
			this.rpi_show_fields();
			return out;
		};

		// Which payment details to show: those of the mode last tapped, and of any mode that already
		// holds an amount (so a split sale shows both). Nothing tapped or paid: nothing shown.
		const CARD_FIELDS = ["rpi_card_type", "rpi_card_last4", "rpi_card_approval_code"];
		const UPI_FIELDS = ["rpi_upi_reference"];
		const is_card = (mode) => /card/i.test(mode || "");
		const is_upi = (mode) => /\bupi\b/i.test(mode || "");

		Payment.rpi_show_fields = function () {
			const group = this.rpi_fields;
			if (!group) return;
			// The last mode tapped stays "current" after ERPNext deselects it (e.g. when the cashier
			// clicks into a card field), so the fields do not vanish while being filled in.
			if (this.selected_mode) this.__rpi_last_mode = this.selected_mode.df?.label;
			const selected = this.__rpi_last_mode;
			const paid = (this.events.get_frm().doc.payments || []).filter((p) => flt(p.amount) > 0).map((p) => p.mode_of_payment);
			const needs = (test) => test(selected) || paid.some(test);
			const show = { card: needs(is_card), upi: needs(is_upi) };
			for (const f of CARD_FIELDS) group.fields_dict[f]?.$wrapper.toggle(show.card);
			for (const f of UPI_FIELDS) group.fields_dict[f]?.$wrapper.toggle(show.upi);
			this.rpi_fields_box?.toggle(show.card || show.upi);
			// Tell the CSS how much room the fields take, so the payment list gives it up.
			this.$component.find(".payment-container-left")
				.toggleClass("rpi-card-shown", show.card)
				.toggleClass("rpi-upi-shown", show.upi);
			// The shorter payment list scrolls: keep the selected mode's tile in view.
			this.$component.find(".mode-of-payment.border-primary").get(0)?.scrollIntoView({ block: "nearest" });
		};

		// Amounts change through the payment controls; refresh when ERPNext stores one.
		frappe.ui.form.on("Sales Invoice Payment", "amount", () => {
			window.cur_pos?.payment?.rpi_show_fields?.();
		});

		// ERPNext selects the default payment mode 500 ms after Checkout by clicking its tile. A tile
		// click toggles, so a cashier who tapped a mode first had it switched OFF again. Select the
		// default only if nothing is selected yet.
		Payment.focus_on_default_mop = function () {
			if (!this.set_gt_to_default_mop) return;
			const doc = this.events.get_frm().doc;
			const default_row = doc.payments.find((p) => p.default);
			if (!default_row) return;
			const mode = this.sanitize_mode_of_payment(default_row.mode_of_payment);
			setTimeout(() => {
				if (this.selected_mode) return;
				this.$payment_modes.find(`.${mode}.mode-of-payment-control`).parent().click();
			}, 500);
		};

		// Tapping a payment mode (again) starts a new amount: the next key replaces whatever is
		// there (e.g. the remaining amount ERPNext pre-fills), like a calculator's first key.
		const erpnext_bind_events = Payment.bind_events;
		Payment.bind_events = function (...args) {
			const out = erpnext_bind_events.apply(this, args);
			this.$component.on("click", ".mode-of-payment", () => {
				this.__rpi_entry = null;
			});
			// After ERPNext has (de)selected the mode: show that mode's details.
			$(document).on("click", () => setTimeout(() => this.rpi_show_fields(), 0));
			return out;
		};

		// Typed like a calculator: digits and one ".", the amount is exactly what was typed.
		const erpnext_on_numpad_clicked = Payment.on_numpad_clicked;
		Payment.on_numpad_clicked = function ($btn, from_numpad = true) {
			const key = from_numpad ? String($btn.attr("data-button-value")) : String($btn);

			// Keys typed into another field (e.g. Card Last 4 Digits) are not amounts.
			if (!from_numpad && typing_in_other_field()) return;

			const is_digit = /^[0-9]$/.test(key);
			const is_point = key === ".";
			const is_delete = key === "delete" || key === "Delete" || key === "Backspace";
			if (!is_digit && !is_point && !is_delete) {
				// Signs and anything else: ERPNext's own handling.
				return erpnext_on_numpad_clicked.call(this, $btn, from_numpad);
			}

			if (!this.selected_mode) {
				frappe.show_alert({ message: __("Select a Payment Method."), indicator: "yellow" });
				return;
			}
			if (from_numpad) highlight($btn);

			// A payment mode just tapped (or a different one selected) starts a new amount.
			if (this.__rpi_mode !== this.selected_mode || this.__rpi_entry == null) {
				this.__rpi_mode = this.selected_mode;
				this.__rpi_entry = "";
			}

			const precision = currency_precision();
			let entry = this.__rpi_entry;
			if (is_delete) {
				entry = entry.slice(0, -1);
			} else if (is_point) {
				if (precision === 0 || entry.includes(".")) return;
				entry = (entry || "0") + ".";
			} else {
				const decimals = entry.includes(".") ? entry.split(".")[1].length : 0;
				if (entry.includes(".") && decimals >= precision) return;
				entry = entry === "0" ? key : entry + key;
			}
			this.__rpi_entry = entry;

			frappe.utils.play_sound("numpad-touch");
			this.selected_mode.set_value(flt(entry || 0, precision));
		};
	}

	function typing_in_other_field() {
		const el = document.activeElement;
		if (!el || !$(el).is("input, textarea, select")) return false;
		return !$(el).closest(".mode-of-payment").length;
	}

	function currency_precision() {
		const info = get_number_format_info(frappe.sys_defaults.number_format);
		const p = frappe.sys_defaults.currency_precision;
		return p === "" || p === undefined || p === null ? info.precision : cint(p);
	}

	function highlight($btn) {
		$btn.addClass("shadow-base-inner bg-selected");
		setTimeout(() => $btn.removeClass("shadow-base-inner bg-selected"), 100);
	}

	function add_styles() {
		if (document.getElementById("rpi-style")) return;
		const style = document.createElement("style");
		style.id = "rpi-style";
		// ERPNext: items / item details / payment span 6 of 10 columns, the cart 4.
		style.textContent = `
			.point-of-sale-app > .items-selector,
			.point-of-sale-app > .item-details-container,
			.point-of-sale-app > .payment-container { grid-column: span 5 / span 5; }
			.point-of-sale-app > .customer-cart-container { grid-column: span 5 / span 5; }

			/* The opening dialog: no row checkboxes, Delete row or Duplicate row. */
			.rpi-opening .row-check,
			.rpi-opening .grid-remove-rows,
			.rpi-opening .grid-duplicate-rows { display: none; }

			/* ERPNext selects a payment mode only when the tap lands on the tile itself; a tap on
			   its amount line was ignored. Let taps on the amount reach the tile. */
			.point-of-sale-app .mode-of-payment > .pay-amount { pointer-events: none; }

			/* Card / UPI details: below the payment buttons, one field per row, full column width.
			   ERPNext sizes the payment list as calc(100vh - 350px), as if nothing else shared the
			   column; with the fields shown it pushed the totals and Complete Order off a 720 px
			   screen. The list now gives up the fields' height and scrolls if it must. (Same selector
			   chain as ERPNext's rule plus our class, so ours wins without !important.) */
			.point-of-sale-app > .payment-container > .payment-split-container > .payment-container-left.rpi-card-shown .payment-modes {
				height: calc(100vh - 350px - 13rem); min-height: 7rem;
			}
			.point-of-sale-app > .payment-container > .payment-split-container > .payment-container-left.rpi-upi-shown .payment-modes {
				height: calc(100vh - 350px - 6rem); min-height: 7rem;
			}
			.point-of-sale-app > .payment-container > .payment-split-container > .payment-container-left.rpi-card-shown.rpi-upi-shown .payment-modes {
				height: calc(100vh - 350px - 18rem); min-height: 7rem;
			}
			.point-of-sale-app .payment-container-left .rpi-fields {
				margin-top: var(--margin-md);
				padding: var(--padding-sm) var(--padding-md);
				border-top: 1px solid var(--border-color);
			}
			/* Frappe caps these inputs at 50% of the box:
			   .layout-main .form-column.col-sm-12 > form > .input-max-width { max-width: 50% } */
			.point-of-sale-app .rpi-fields .form-column.col-sm-12 > form > .frappe-control.input-max-width {
				max-width: 100%;
			}
		`;
		document.head.appendChild(style);
	}
})();
