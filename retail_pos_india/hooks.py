app_name = "retail_pos_india"
app_title = "Retail POS India"
app_publisher = "Sudhanshu Shekhar"
app_description = "Point of Sale tweaks for ERPNext: whole-amount number pad, safe card and UPI details, wider cart"
app_email = "sudhanshushekhar496@gmail.com"
app_license = "mit"

required_apps = ["erpnext"]

# Loaded into the Point of Sale page after ERPNext's own script (no asset build needed).
page_js = {"point-of-sale": "public/js/point_of_sale.js"}

# Card and UPI detail fields on Sales Invoice, and their place on the POS payment screen.
after_install = "retail_pos_india.setup.install.after_install"
after_migrate = "retail_pos_india.setup.install.after_install"
before_uninstall = "retail_pos_india.setup.install.before_uninstall"

doc_events = {
	"Sales Invoice": {
		"validate": "retail_pos_india.payment_details.validate",
		"before_submit": "retail_pos_india.payment_details.before_submit",
	},
}
