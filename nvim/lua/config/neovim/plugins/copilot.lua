return {
	"zbirenbaum/copilot.lua",
	cmd = "Copilot",
	event = "InsertEnter",
	config = function()
		require("copilot").setup({
			suggestion = {
				enabled = true,
				auto_trigger = true,
				keymap = {
					accept = false, -- Tabキーはcmp.luaで制御
					accept_word = false,
					accept_line = false,
					next = "<M-]>",
					prev = "<M-[>",
					dismiss = "<C-]>",
				},
			},
			panel = { enabled = true },
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
