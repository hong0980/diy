-- Copyright 2008 Steven Barth <steven@midlink.org>
-- Licensed to the public under the Apache License 2.0.

local util = require "luci.util"

-- 作用：定义并初始化 luci.config 模块，用于动态加载和访问 UCI 配置
-- 描述：该模块通过元表实现对 luci 配置的惰性加载，仅在访问特定配置键时从 UCI 加载数据，
--       并使用线程局部存储确保线程安全。依赖 luci.model.uci 模块。
module("luci.config",
    function(m)
        -- 检查是否可以加载 luci.model.uci 模块
        if pcall(require, "luci.model.uci") then
            -- 创建线程局部存储，用于缓存 UCI 配置
            local config = util.threadlocal()

            -- 为模块设置元表，实现动态索引
            setmetatable(m, {
                __index = function(tbl, key)
                    -- 如果配置尚未加载，从 UCI 获取 luci 配置节的全部数据
                    if not config[key] then
                        config[key] = luci.model.uci.cursor():get_all("luci", key)
                    end
                    -- 返回缓存的配置数据
                    return config[key]
                end
            })
        end
    end)
