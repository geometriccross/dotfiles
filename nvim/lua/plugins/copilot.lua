return {
	"zbirenbaum/copilot.lua",
	cmd = "Copilot",
	event = "InsertEnter",
	config = function()
		require("copilot").setup({
			suggestion = { enabled = false },
			panel = { enabled = false },
			server_opts_overrides = {
				trace = "verbose",
				cmd = {
					vim.fn.expand("~/.local/share/nvim/mason/bin/copilot-language-server"),
					"--stdio",
				},
				settings = {
					advanced = {
						listCount = 10,
						inlineSuggestCount = 3,
					},
				},
			},
			filetypes = { ["*"] = true },
		})
	end,
}
