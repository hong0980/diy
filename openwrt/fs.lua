--[[
nixio - Linux I/O 库，用于 Lua

版权声明：2009 Steven Barth <steven@midlink.org>

授权协议：代码遵循 Apache License 2.0 许可，允许公共使用

许可协议地址：
http://www.apache.org/licenses/LICENSE-2.0

版本标识：$Id$
]]--

-- 导入标准 Lua 的 table 模块，用于表操作（如插入、连接）
local table = require "table"

-- 导入 nixio 模块，提供 Linux I/O 操作接口
local nixio = require "nixio"

-- 导入标准 Lua 的 type、ipairs 和 setmetatable 函数
local type, ipairs, setmetatable = type, ipairs, setmetatable

-- 导入 nixio.util 模块，提供实用工具函数
require "nixio.util"

-- 定义 nixio.fs 模块，并设置元表以支持 nixio.fs 的方法
module ("nixio.fs", function(m) setmetatable(m, {__index = nixio.fs}) end)

-- 定义函数 readfile，读取文件内容
-- 作用：打开指定路径的文件并读取其内容，支持限制读取大小
function readfile(path, limit)
	-- 以只读模式打开文件
	local fd, code, msg = nixio.open(path, "r")
	local data
	-- 如果打开失败，返回错误信息
	if not fd then
		return nil, code, msg
	end
	
	-- 读取文件全部内容或指定大小
	data, code, msg = fd:readall(limit)
	
	-- 关闭文件句柄
	fd:close()
	-- 返回读取的数据及状态
	return data, code, msg
end

-- 定义函数 writefile，写入文件内容
-- 作用：将数据写入指定路径的文件
function writefile(path, data)
	-- 以写入模式打开文件
	local fd, code, msg, stat = nixio.open(path, "w")
	-- 如果打开失败，返回错误信息
	if not fd then
		return nil, code, msg
	end
	
	-- 写入全部数据
	stat, code, msg = fd:writeall(data)
	
	-- 关闭文件句柄
	fd:close()
	-- 返回写入状态及信息
	return stat, code, msg
end

-- 定义函数 datacopy，复制文件数据
-- 作用：从源文件复制指定大小的数据到目标文件
function datacopy(src, dest, size)
	-- 以只读模式打开源文件
	local fdin, code, msg = nixio.open(src, "r")
	-- 如果打开失败，返回错误信息
	if not fdin then
		return nil, code, msg
	end
	
	-- 以写入模式打开目标文件
	local fdout, code, msg = nixio.open(dest, "w")
	-- 如果打开失败，返回错误信息
	if not fdout then
		return nil, code, msg
	end	
	
	-- 执行数据复制
	local stat, code, msg, sent = fdin:copy(fdout, size)
	-- 关闭源文件句柄
	fdin:close()
	-- 关闭目标文件句柄
	fdout:close()

	-- 返回复制状态及信息
	return stat, code, msg, sent
end

-- 定义函数 copy，复制文件或目录
-- 作用：复制源文件或目录到目标路径，保留元数据
function copy(src, dest)
	-- 获取源文件的元数据
	local stat, code, msg, res = nixio.fs.lstat(src)
	-- 如果获取失败，返回错误信息
	if not stat then
		return nil, code, msg
	end
	
	-- 如果源是目录
	if stat.type == "dir" then
		-- 检查目标是否为目录
		if nixio.fs.stat(dest, type) ~= "dir" then
			-- 创建目标目录
			res, code, msg = nixio.fs.mkdir(dest)
		else
			-- 目标已是目录，标记成功
			stat = true
		end
	-- 如果源是符号链接
	elseif stat.type == "lnk" then
		-- 创建符号链接到目标
		res, code, msg = nixio.fs.symlink(nixio.fs.readlink(src), dest)
	-- 如果源是普通文件
	elseif stat.type == "reg" then
		-- 复制文件数据
		res, code, msg = datacopy(src, dest)
	end
	
	-- 如果复制操作失败，返回错误信息
	if not res then
		return nil, code, msg
	end
	
	-- 设置目标文件的访问和修改时间
	nixio.fs.utimes(dest, stat.atime, stat.mtime)
	
	-- 如果支持更改所有者，设置目标文件的所有者
	if nixio.fs.lchown then
		nixio.fs.lchown(dest, stat.uid, stat.gid)
	end
	
	-- 如果目标不是符号链接，设置文件权限
	if stat.type ~= "lnk" then
		nixio.fs.chmod(dest, stat.modedec)
	end
	
	-- 返回成功状态
	return true
end

-- 定义函数 move，移动文件或目录
-- 作用：将源文件或目录移动到目标路径
function move(src, dest)
	-- 尝试重命名文件
	local stat, code, msg = nixio.fs.rename(src, dest)
	-- 如果重命名失败且原因是跨设备
	if not stat and code == nixio.const.EXDEV then
		-- 复制文件到目标
		stat, code, msg = copy(src, dest)
		-- 如果复制成功，删除源文件
		if stat then
			stat, code, msg = nixio.fs.unlink(src)
		end
	end
	-- 返回操作状态及信息
	return stat, code, msg
end

-- 定义函数 mkdirr，递归创建目录
-- 作用：创建指定路径的目录，包括必要的父目录
function mkdirr(dest, mode)
	-- 检查目标路径是否已是目录
	if nixio.fs.stat(dest, "type") == "dir" then
		return true
	else
		-- 尝试创建目录
		local stat, code, msg = nixio.fs.mkdir(dest, mode)
		-- 如果失败原因是路径不存在
		if not stat and code == nixio.const.ENOENT then
			-- 递归创建父目录
			stat, code, msg = mkdirr(nixio.fs.dirname(dest), mode)
			-- 如果父目录创建成功，再次尝试创建目标目录
			if stat then
				stat, code, msg = nixio.fs.mkdir(dest, mode)
			end
		end
		-- 返回操作状态及信息
		return stat, code, msg
	end
end

-- 定义内部函数 _recurse，递归处理文件或目录
-- 作用：对文件或目录树执行指定操作
local function _recurse(cb, src, dest)
	-- 获取源文件的类型
	local type = nixio.fs.lstat(src, "type")
	-- 如果源不是目录，直接执行回调
	if type ~= "dir" then
		return cb(src, dest)
	else
		-- 初始化状态变量
		local stat, se, code, msg, s, c, m = true, nixio.const.sep
		-- 如果指定了目标路径
		if dest then
			-- 执行回调操作
			s, c, m = cb(src, dest)
			-- 更新状态
			stat, code, msg = stat and s, c or code, m or msg
		end

		-- 遍历源目录中的所有条目
		for e in nixio.fs.dir(src) do
			-- 根据是否有目标路径，递归处理子条目
			if dest then
				s, c, m = _recurse(cb, src .. se .. e, dest .. se .. e)
			else
				s, c, m = _recurse(cb, src .. se .. e)
			end
			-- 更新状态
			stat, code, msg = stat and s, c or code, m or msg
		end

		-- 如果没有目标路径，后序处理目录
		if not dest then
			s, c, m = cb(src)
			-- 更新状态
			stat, code, msg = stat and s, c or code, m or msg
		end

		-- 返回操作状态及信息
		return stat, code, msg
	end
end

-- 定义函数 copyr，递归复制目录
-- 作用：复制整个目录树到目标路径
function copyr(src, dest)
	-- 使用 _recurse 执行复制操作
	return _recurse(copy, src, dest)
end

-- 定义函数 mover，递归移动目录
-- 作用：移动整个目录树到目标路径
function mover(src, dest)
	-- 尝试重命名目录
	local stat, code, msg = nixio.fs.rename(src, dest)
	-- 如果重命名失败且原因是跨设备
	if not stat and code == nixio.const.EXDEV then
		-- 递归复制目录
		stat, code, msg = _recurse(copy, src, dest)
		-- 如果复制成功，递归删除源目录
		if stat then
			stat, code, msg = _recurse(nixio.fs.remove, src)
		end
	end
	-- 返回操作状态及信息
	return stat, code, msg
end

-- 定义函数 remover，递归删除目录
-- 作用：删除整个目录树
function remover(src)
	-- 使用 _recurse 执行删除操作
	return _recurse(nixio.fs.remove, src)
end
