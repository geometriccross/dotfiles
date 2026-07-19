return {
	"windwp/nvim-autopairs",
	event = "InsertEnter",
	config = true,
	-- disable if you write lisp
	-- in this case, auto pair is done by nvim-parinfer
	-- check lua/plugins/nvim-parinfer.lua
	disable_filetype = {
		"TelescopePrompt",
		"spectre_panel",
		"*.rkt",
		"*.scm",
		"*.lisp",
		"*.clj",
	},
}
