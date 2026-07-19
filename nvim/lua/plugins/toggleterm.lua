---@diagnostic disable: lowercase-global
return {
	"akinsho/toggleterm.nvim",
	config = function()
		local Terminal = require("toggleterm.terminal").Terminal
		local lazygit = Terminal:new({
			cmd = "lazygit",
			direction = "float",
			hidden = true,
		})

		local float_terminal = Terminal:new({
			direction = "float",
			hidden = true,
		})

		function _lazygit_toggle()
			lazygit:toggle()
		end

		function _terminal_toggle()
			float_terminal:toggle()
		end

		vim.api.nvim_set_keymap("n", "<leader>g", "<cmd>lua _lazygit_toggle()<CR>", { noremap = true, silent = true })
		vim.api.nvim_set_keymap(
			"n",
			"<leader><leader>",
			"<cmd>lua _terminal_toggle()<CR>",
			{ noremap = true, silent = true }
		)

		require("toggleterm").setup()
	end,
}
