return {
	"terrortylor/nvim-comment",
	dependencies = { "JoosepAlviste/nvim-ts-context-commentstring" },
	config = function()
		require("ts_context_commentstring").setup()
		require("nvim_comment").setup({
			hook = function()
				if vim.api.nvim_buf_get_option(0, "filetype") == "typescriptreact" then
					require("ts_context_commentstring.internal").update_commentstring()
				end
			end,
		})
	end,
}
