-- plugin import ---------------------------------
require("config.lazy")
SetupLazy({
	{ import = "plugins" },
	{ import = "colorscheme" },
})

-- setting import ---------------------------------
require("config.autocmds")
require("config.keymaps")
require("config.options")
require("config.lsp")

vim.cmd [[colorscheme tokyonight]]
