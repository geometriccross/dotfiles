return {
	"windwp/nvim-autopairs",
	event = "InsertEnter",
	-- Disable for Lisp-family buffers, where nvim-parinfer manages pairs.
	opts = {
		disable_filetype = {
			"TelescopePrompt",
			"spectre_panel",
			"racket",
			"scheme",
			"lisp",
			"clojure",
		},
	},
}
