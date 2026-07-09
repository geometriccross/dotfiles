-- escape from insetrmode with "jj"
vim.keymap.set("i", "jj", "<Esc>")

-- escape from terminal
vim.keymap.set("t", "<Esc><Esc>", "<C-\\><C-n>")

-- tab switch keymaps
vim.keymap.set("n", "<C-h>", "<C-w>h")
vim.keymap.set("n", "<C-l>", "<C-w>l")
vim.keymap.set("n", "<C-j>", "<C-w>j")
vim.keymap.set("n", "<C-k>", "<C-w>k")

-- indent
vim.keymap.set("n", "<TAB>", ">>")
vim.keymap.set("n", "<S-TAB>", "<<")
vim.keymap.set("v", "<TAB>", ">gv")
vim.keymap.set("v", "<S-TAB>", "<gv")
