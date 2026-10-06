app_name = "retail_pos_india"
app_title = "Retail POS India"
app_publisher = "Sudhanshu Shekhar"
app_description = "Point of Sale tweaks for ERPNext: whole-amount number pad, safe card and UPI details, wider cart"
app_email = "sudhanshushekhar496@gmail.com"
app_license = "mit"

required_apps = ["erpnext"]

# Loaded into the Point of Sale page after ERPNext's own script (no asset build needed).
page_js = {"point-of-sale": "public/js/point_of_sale.js"}

# Loaded on every desk page: keeps cashiers on the Point of Sale. Served from /assets, so the app's
# public folder must be reachable there (the Docker setup mounts it into the web server).
app_include_js = ["/assets/retail_pos_india/js/cashier_guard.js"]

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
