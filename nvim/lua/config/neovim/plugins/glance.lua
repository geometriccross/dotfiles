return {
	"dnlhc/glance.nvim",
	cmd = "Glance",
	options = {
		keymap = {
			vim.keymap.set("n", "gD", "<cmd>Glance definitions<cr>", { desc = "Glance definitions" }),
			vim.keymap.set("n", "gR", "<cmd>Glance references<cr>", { desc = "Glance references" }),
			vim.keymap.set("n", "gY", "<cmd>Glance type_definitions<cr>", { desc = "Glance type definitions" }),
			vim.keymap.set("n", "gM", "<cmd>Glance implementationss<cr>", { desc = "Glance implementations" }),
		},
	},
}
