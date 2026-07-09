local function remove_extension(filename)
	-- 最後のドットから末尾までを除去
	return filename:match("(.+)%.[^%.]+$") or filename
end

function LibPath(stdpath, path)
	-- if passed like this 'hoge/aaa', it need to add / in top of string
	if string.sub(path, 1, 1) ~= "/" then
		path = "/" .. path
	end

	return vim.fn.expand(vim.fn.stdpath(stdpath) .. path)
end

function FileExists(name)
	local f = io.open(name, "r")
	if f ~= nil then
		io.close(f)
		return true
	else
		return false
	end
end

function Remove_extension(filename)
	-- 最後のドットから末尾までを除去
	return filename:match("(.+)%.[^%.]+$") or filename
end

function Scandir(directory, disable_postfix)
	disable_postfix = disable_postfix or false
	local handle = vim.loop.fs_scandir(directory)
	if not handle then
		return {}
	end

	local result = {}
	while true do
		local name, type = vim.loop.fs_scandir_next(handle)
		if not name then
			break
		end
		if disable_postfix then
			name = remove_extension(name)
		end
		table.insert(result, { name = name, type = type })
	end
	return result
end

return {
	LibPath = LibPath,
	FileExists = FileExists,
	Remove_extension = Remove_extension,
	Scandir = Scandir,
}
