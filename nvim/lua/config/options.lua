-- leader key has already set in lazy.lua

-- show the line number of cursor
vim.opt.number = true
vim.opt.relativenumber = true

vim.opt.breakindent = true
vim.opt.undofile = true
vim.opt.splitright = true
vim.opt.splitbelow = true
vim.opt.cursorline = true
vim.opt.scrolloff = 10

-- indent setting
vim.opt.tabstop = 4
vim.opt.shiftwidth = 4
vim.opt.shiftround = true

--  Schedule the setting after `UiEnter` because it can increase startup-time.
--  Remove this option if you want your OS clipboard to remain independent.
vim.schedule(function()
	vim.opt.clipboard = "unnamedplus"
end)

-- https://www.reddit.com/r/neovim/comments/1e3wn02/wsl2_remove_cr_carriage_return_m_on_paste_or_on/?tl=ja
local function augroup(name)
	return vim.api.nvim_create_augroup("zenedit_" .. name, { clear = true })
end

-- windowsからペーストされた場合にcrを削除
vim.api.nvim_create_autocmd({ "BufReadPost", "TextChanged", "TextChangedI" }, {
	group = augroup("remove_cr"),
	callback = function()
		if vim.bo.modifiable then
			pcall(vim.cmd, [[%s/\r//g]])
		end
	end,
})
