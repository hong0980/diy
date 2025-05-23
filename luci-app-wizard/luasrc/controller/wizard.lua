module("luci.controller.wizard", package.seeall)

function index()
    if not nixio.fs.access("/etc/config/wizard") then
        return
    end
    entry({"admin", "system", "wizard" }, alias("admin", "system", "wizard", "wizard"), _("快捷设置"), 1).dependent = true
    entry({"admin", "system", "wizard", "wizard"}, cbi("wizard/wizard"), _("网络设置"), 1).leaf = true
    entry({"admin", "system", "wizard", "file"}, cbi("wizard/file"), _("快捷修改"), 2).leaf = true
end
