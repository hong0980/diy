local fs   = require "nixio.fs"
local util = require "luci.util"
local http = require "luci.http"
module("luci.controller.filebrowser", package.seeall)
function index()
    entry({"admin", "system", "filebrowser"}, template("filebrowser"), _("File management"), 60).dependent = true
    entry({"admin", "system", "dpfile"}, call("dpfile"), nil).leaf = true
    entry({"admin", "system", "file_list"}, call("file_list"), nil).leaf = true
    entry({"admin", "system", "uploadfile"}, call("uploadfile"), nil).leaf = true
    entry({"admin", "system", "file_tools"}, call("file_tools"), nil).leaf = true
    entry({"admin", "system", "createnewfile"}, call("createnewfile"), nil).leaf = true
    entry({"admin", "system", "handleDocument"}, call("handleDocument"), nil).leaf = true
end

local MIME_TYPES = {
    avi    = "video/x-msvideo",
    bmp    = "image/bmp",
    c      = "text/plain; charset=UTF-8",
    conf   = "text/plain; charset=UTF-8",
    css    = "text/plain; charset=UTF-8",
    deb    = "application/x-debian-package",
    doc    = "application/msword",
    gif    = "image/gif",
    h      = "text/plain; charset=UTF-8",
    htm    = "text/plain; charset=UTF-8",
    html   = "text/plain; charset=UTF-8",
    iso    = "application/x-iso9660-image",
    js     = "text/plain; charset=UTF-8",
    json   = "text/plain; charset=UTF-8",
    jpg    = "image/jpeg",
    jpeg   = "image/jpeg",
    ko     = "text/plain; charset=UTF-8",
    lua    = "text/plain; charset=UTF-8",
    log    = "text/plain; charset=UTF-8",
    mpg    = "video/mpeg",
    mpeg   = "video/mpeg",
    mp3    = "audio/mpeg",
    o      = "text/plain; charset=UTF-8",
    odp    = "application/vnd.oasis.opendocument.presentation",
    odt    = "application/vnd.oasis.opendocument.text",
    ogg    = "application/ogg",
    ovpn   = "application/x-openvpn-profile",
    pdf    = "application/pdf",
    patch  = "text/plain; charset=UTF-8",
    php    = "text/plain; charset=UTF-8",
    pl     = "text/plain; charset=UTF-8",
    png    = "image/png",
    ppt    = "application/vnd.ms-powerpoint",
    sh     = "text/plain; charset=UTF-8",
    svg    = "text/plain; charset=UTF-8",
    tar    = "application/x-tar",
    txt    = "text/plain; charset=UTF-8",
    wav    = "audio/x-wav",
    xsl    = "text/plain; charset=UTF-8",
    xls    = "application/vnd.ms-excel",
    xml    = "text/plain; charset=UTF-8",
    yaml   = "text/plain; charset=UTF-8",
    zip    = "application/zip",
}

local stat = false
function hvalue(value)
    return http.formvalue(value) or nil
end

function list_response(path, lstat)
    http.prepare_content("application/json")
    http.write_json({
        stat = lstat,
        data = lstat and fs.stat(path, 'type') == "dir" and arrangefiles(path) or nil
    })
end

function arrangefiles(dir)
    local linkFiles, regularFiles = {}, {}
    local cmd = util.execi('ls -Ah --full-time --group-directories-first "%s"' %{dir})
    for fileinfo in cmd do
        local dir_name = fileinfo:match("%s([^%s]+)$")
        local dir_path = ('/%s/%s' %{dir, dir_name}):gsub("/+", "/")
        if fileinfo:sub(1, 2) == 'lr' then
            util.append(linkFiles, fileinfo)
        elseif fileinfo:sub(1, 2) == 'dr' and dir_name ~= "proc" then
            for sizeinfo in util.execi('du -sh %s | cut -f1' %{dir_path}) do
                fileinfo = fileinfo:gsub("(%s+%S+%s+%S+%s+%S+%s+)(%S+)(%s+.+)$", "%1" .. sizeinfo .. "%3")
            end
            util.append(regularFiles, fileinfo)
        else
            util.append(regularFiles, fileinfo)
        end
    end
    return util.combine(regularFiles, linkFiles)
end

function file_list()
    list_response(hvalue("path"), true)
end

function handleDocument()
    local path, content = hvalue("path"), hvalue("content")
    http.prepare_content("application/json")

    if fs.stat(path, "type") ~= "reg" then
        return http.write_json({ success = false, msg = luci.i18n.translatef("file does not exist")})
    end

    if content and path then
        local stat = fs.writefile(path, content:gsub("\r\n?", "\n")) ~= nil
        return http.write_json({
            success = stat,
            msg = stat and luci.i18n.translatef("Document saved successfully")
                       or luci.i18n.translatef("Failed to save document")
        })
    end

    local data = fs.readfile(path)
    if not data or #data == 0 then
        return http.write_json({ success = false, msg = luci.i18n.translatef("Failed to load document")})
    end
    return http.write_json({ success = true, data = data })
end

function file_tools()
    local path,     dir_path   = hvalue("path"),     hvalue("dir_path")
    local newname,  linkPath   = hvalue("newname"),  hvalue("linkPath")
    local oldname,  targetPath = hvalue("oldname"),  hvalue("targetPath")
    local filepath, modify     = hvalue("filepath"), hvalue("permissions")

    if dir_path then
        stat = fs.stat(dir_path, "type") == "dir"
        http.prepare_content("application/json")
        http.write_json({ stat = stat })
    elseif modify then
        stat = fs.chmod(path, modify)
        list_response(fs.dirname(path), stat)
    elseif newname and oldname then
        stat = fs.move(oldname, newname)
        list_response(fs.dirname(oldname), stat)
    elseif linkPath then
        stat = hvalue("isHardLink") == 'true' and fs.link(targetPath, linkPath) or fs.symlink(targetPath, linkPath)
        list_response(fs.dirname(linkPath), stat)
    elseif filepath then
        stat = filepath:match(".*%.(.*)$") == "ipk" and util.exec('opkg --force-depends install "%s"' %{filepath})
        http.prepare_content("application/json")
        http.write_json({ data = stat, stat = stat ~= nil })
    else
        stat = util.exec('rm -rf "%s"' %{path}) ~= nil
        list_response(fs.dirname(path), stat)
    end
end

function createnewfile()
    local path, perms = hvalue("newfile"), hvalue("perms")
    if hvalue("is_dir") == 'true' then
        stat = util.exec('mkdir -m "%s" -p "%s"' %{perms, path}) ~= nil
    else
        local file_handle = io.open(path, "w")
        file_handle:setvbuf("full", 1024 * 1024)
        stat = file_handle:write(hvalue("data"))
        file_handle:close()
        fs.chmod(path, perms)
    end
    list_response(fs.dirname(path), stat)
end

function uploadfile()
    local fd, filedir, filename = nil, hvalue("filedir"), hvalue("filename")
    if filename:match(".*%.(.*)$") == "ipk" then
        filedir = '/tmp/ipkdir/'
        if fs.stat(filedir, "type") ~= "dir" then
            util.exec('mkdir -p "%s"' %{filedir})
        end
    end
    http.setfilehandler(function(meta, chunk, eof)
        if not fd then
            if meta and chunk then
                fd = io.open(filedir .. filename, "w")
            end
        end
        if chunk and fd then
            fd:write(chunk)
        end
        if eof and fd then
            fd:close()
            fd = nil
            stat = true
        end
    end)
    http.prepare_content("application/json")
    http.write_json({
        stat = stat, filename = filename, filedir = filedir
    })
end

function downloadfile(filepath)
    local fd, filename, isDir = nil, nil, fs.stat(filepath, "type") == "dir"
    if isDir then
        fd = io.popen('tar -C "%s" -cz .' %{filepath}, "r")
        filename = fs.basename(filepath) .. ".tar.gz"
        http.header('Content-Type', 'application/x-tar')
    else
        fd = io.open(filepath, "r")
        filename = fs.basename(filepath)
    end
    if not fd then return end
    http.header('Content-Disposition', 'inline; filename="%s"' %{filename})
    luci.ltn12.pump.all(luci.ltn12.source.file(fd), luci.http.write)
end

function to_mime(filename, download)
    if download == 'open' then
        local ext = filename:match("%.(%w+)$")
        return MIME_TYPES[ext and ext:lower()] or "text/plain; charset=UTF-8"
    elseif download == 'true' or type(filename) ~= "string" then
        return "application/octet-stream"
    end
end

function dpfile()
    local path, linkfile = hvalue("path"), hvalue("linkfile")
    local filename, download = hvalue("filename"), hvalue("download")
    local filepath = ((linkfile == "1") and "" or path) .. filename
    local mime = to_mime(filename, download)
    http.prepare_content(mime)
    if mime == "application/octet-stream" then
        downloadfile(filepath)
    else
        http.header('Content-Disposition', 'inline; filename="%s"' %{filename})
        local lstat = luci.ltn12.pump.all(luci.ltn12.source.file(io.open(filepath, "r")), http.write)
        if not lstat then
            http.write(luci.i18n.translatef("Unable to open file: %s", filepath))
        end
    end
end
