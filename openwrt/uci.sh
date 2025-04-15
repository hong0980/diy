#!/bin/sh
# 指定脚本使用 POSIX 兼容的 shell 运行。

# 为 /sbin/uci 提供 shell 脚本兼容性封装
# 该脚本为 OpenWrt 的 UCI（统一配置接口）命令行工具提供封装函数，用于简化配置管理。

# Copyright (C) 2008-2010  OpenWrt.org
# Copyright (C) 2008  Felix Fietkau <nbd@nbd.name>
# 版权信息，标明原始作者和年份。

# This program is free software; you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation; either version 2 of the License, or
# (at your option) any later version.
# 本脚本基于 GNU 通用公共许可证（GPL）版本 2 或更高版本发布。

# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
# General Public License for more details.
# 声明本脚本不提供任何明示或暗示的担保。

# You should have received a copy of the GNU General Public License
# along with this program; if not, write to the Free Software
# Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA 02111-1307 USA
# 如果未收到 GPL 副本，可联系自由软件基金会获取。

CONFIG_APPEND=
# 初始化一个空变量，用于控制配置加载是追加还是覆盖。

uci_load() {
	# 作用：加载指定包的 UCI 配置到环境变量中，支持追加或覆盖模式。
	local PACKAGE="$1"
	# 将第一个参数存储为包名称。
	local DATA
	# 声明一个变量，用于保存 UCI 导出的数据。
	local RET
	# 声明一个变量，用于保存 UCI 命令的返回状态。
	local VAR
	# 声明一个变量，用于迭代配置状态变量。

	_C=0
	# 初始化一个计数器变量（可能用于内部跟踪配置节）。
	if [ -z "$CONFIG_APPEND" ]; then
		# 检查 CONFIG_APPEND 是否未设置或为空，以决定是否重置配置状态。
		for VAR in $CONFIG_LIST_STATE; do
			# 遍历存储在 CONFIG_LIST_STATE 中的状态变量列表。
			export ${NO_EXPORT:+-n} CONFIG_${VAR}=
			# 清空每个配置状态变量。
			export ${NO_EXPORT:+-n} CONFIG_${VAR}_LENGTH=
			# 清空每个配置状态变量的长度。
		done
		export ${NO_EXPORT:+-n} CONFIG_LIST_STATE=
		# 清空状态变量列表。
		export ${NO_EXPORT:+-n} CONFIG_SECTIONS=
		# 清空配置节列表。
		export ${NO_EXPORT:+-n} CONFIG_NUM_SECTIONS=0
		# 重置配置节计数。
		export ${NO_EXPORT:+-n} CONFIG_SECTION=
		# 清空当前配置节。
	fi

	DATA="$(/sbin/uci ${UCI_CONFIG_DIR:+-c $UCI_CONFIG_DIR} ${LOAD_STATE:+-P /var/state} -S -n export "$PACKAGE" 2>/dev/null)"
	# 执行 UCI 命令导出包配置，并抑制错误输出。
	RET="$?"
	# 保存 UCI 命令的返回状态。
	[ "$RET" != 0 -o -z "$DATA" ] || eval "$DATA"
	# 如果命令成功且数据非空，则执行导出的数据以设置环境变量。
	unset DATA
	# 清空 DATA 变量以释放内存。

	${CONFIG_SECTION:+config_cb}
	# 如果 CONFIG_SECTION 已设置，则调用 config_cb 函数（如果已定义）进行后处理。
	return "$RET"
	# 返回 UCI 命令的状态。
}

uci_set_default() {
	# 作用：检查指定包是否存在，若不存在则导入其默认配置并提交。
	local PACKAGE="$1"
	# 将第一个参数存储为包名称。
	/sbin/uci ${UCI_CONFIG_DIR:+-c $UCI_CONFIG_DIR} -q show "$PACKAGE" > /dev/null && return 0
	# 检查包是否存在；如果存在，则成功退出。
	/sbin/uci ${UCI_CONFIG_DIR:+-c $UCI_CONFIG_DIR} import "$PACKAGE"
	# 如果包不存在，则导入其默认配置。
	/sbin/uci ${UCI_CONFIG_DIR:+-c $UCI_CONFIG_DIR} commit "$PACKAGE"
	# 提交导入的配置以使其持久化。
}

uci_revert_state() {
	# 作用：撤销指定包、节或选项在状态目录中的更改，恢复到默认状态。
	local PACKAGE="$1"
	# 将第一个参数存储为包名称。
	local CONFIG="$2"
	# 将第二个参数存储为配置节。
	local OPTION="$3"
	# 将第三个参数存储为配置选项。

	/sbin/uci ${UCI_CONFIG_DIR:+-c $UCI_CONFIG_DIR} -P /var/state revert "$PACKAGE${CONFIG:+.$CONFIG}${OPTION:+.$OPTION}"
	# 执行 UCI 命令，在状态目录中撤销指定的包、节或选项。
}

uci_set_state() {
	# 作用：在状态目录中设置指定包、节或选项的值，适用于临时状态管理。
	local PACKAGE="$1"
	# 将第一个参数存储为包名称。
	local CONFIG="$2"
	# 将第二个参数存储为配置节。
	local OPTION="$3"
	# 将第三个参数存储为配置选项。
	local VALUE="$4"
	# 将第四个参数存储为要设置的值。

	[ "$#" = 4 ] || return 0
	# 确保提供恰好四个参数；否则，成功退出。
	/sbin/uci ${UCI_CONFIG_DIR:+-c $UCI_CONFIG_DIR} -P /var/state set "$PACKAGE.$CONFIG${OPTION:+.$OPTION}=$VALUE"
	# 在状态目录中设置指定的选项或节为给定的值。
}

uci_toggle_state() {
	# 作用：通过撤销并重新设置状态值，实现状态的切换。
	local PACKAGE="$1"
	# 将第一个参数存储为包名称。
	local CONFIG="$2"
	# 将第二个参数存储为配置节。
	local OPTION="$3"
	# 将第三个参数存储为配置选项。
	local VALUE="$4"
	# 将第四个参数存储为要设置的值。

	uci_revert_state "$1" "$2" "$3"
	# 使用前三个参数调用 uci_revert_state 以清除当前状态。
	uci_set_state "$1" "$2" "$3" "$4"
	# 使用所有四个参数调用 uci_set_state 以设置新的状态值。
}

uci_set() {
	# 作用：设置指定包、节和选项的配置值，持久化到配置文件中。
	local PACKAGE="$1"
	# 将第一个参数存储为包名称。
	local CONFIG="$2"
	# 将第二个参数存储为配置节。
	local OPTION="$3"
	# 将第三个参数存储为配置选项。
	local VALUE="$4"
	# 将第四个参数存储为要设置的值。

	/sbin/uci ${UCI_CONFIG_DIR:+-c $UCI_CONFIG_DIR} set "$PACKAGE.$CONFIG.$OPTION=$VALUE"
	# 执行 UCI 命令，将指定的选项设置为给定的值。
}

uci_add_list() {
	# 作用：向指定包、节的列表选项中追加一个值。
	local PACKAGE="$1"
	# 将第一个参数存储为包名称。
	local CONFIG="$2"
	# 将第二个参数存储为配置节。
	local OPTION="$3"
	# 将第三个参数存储为配置选项。
	local VALUE="$4"
	# 将第四个参数存储为要添加的值。

	/sbin/uci ${UCI_CONFIG_DIR:+-c $UCI_CONFIG_DIR} add_list "$PACKAGE.$CONFIG.$OPTION=$VALUE"
	# 执行 UCI 命令，将值追加到指定包、节和选项的列表中。
}

uci_get_state() {
	# 作用：从状态目录中获取指定包、节或选项的值。
	local PACKAGE="$1"
	# 将第一个参数存储为包名称。
	local CONFIG="$2"
	# 将第二个参数存储为配置节。
	local OPTION="$3"
	# 将第三个参数存储为配置选项。
	local DEFAULT="$4"
	# 将第四个参数存储为默认值。

	uci_get "$1" "$2" "$3" "$4" "/var/state"
	# 调用 uci_get 函数，指定状态目录 /var/state。
}

uci_get() {
	# 作用：获取指定包、节或选项的配置值，若失败可返回默认值。
	local PACKAGE="$1"
	# 将第一个参数存储为包名称。
	local CONFIG="$2"
	# 将第二个参数存储为配置节。
	local OPTION="$3"
	# 将第三个参数存储为配置选项。
	local DEFAULT="$4"
	# 将第四个参数存储为默认值。
	local STATE="$5"
	# 将第五个参数存储为状态目录（可选）。

	/sbin/uci ${UCI_CONFIG_DIR:+-c $UCI_CONFIG_DIR} ${STATE:+-P $STATE} -q get "$PACKAGE${CONFIG:+.$CONFIG}${OPTION:+.$OPTION}"
	# 执行 UCI 命令，获取指定包、节或选项的值，抑制错误信息。
	RET="$?"
	# 保存 UCI 命令的返回状态。
	[ "$RET" -ne 0 ] && [ -n "$DEFAULT" ] && echo "$DEFAULT"
	# 如果命令失败且提供了默认值，则输出默认值。
	return "$RET"
	# 返回 UCI 命令的状态。
}

uci_add() {
	# 作用：向指定包添加新的配置节，可自动生成节名或使用指定名称。
	local PACKAGE="$1"
	# 将第一个参数存储为包名称。
	local TYPE="$2"
	# 将第二个参数存储为配置类型。
	local CONFIG="$3"
	# 将第三个参数存储为配置节名称（可选）。

	if [ -z "$CONFIG" ]; then
		# 如果未提供配置节名称。
		export ${NO_EXPORT:+-n} CONFIG_SECTION="$(/sbin/uci ${UCI_CONFIG_DIR:+-c $UCI_CONFIG_DIR} add "$PACKAGE" "$TYPE")"
		# 执行 UCI 命令添加新节，并将生成的节名称存储到 CONFIG_SECTION。
	else
		# 如果提供了配置节名称。
		/sbin/uci ${UCI_CONFIG_DIR:+-c $UCI_CONFIG_DIR} set "$PACKAGE.$CONFIG=$TYPE"
		# 执行 UCI 命令设置指定节的类型。
		export ${NO_EXPORT:+-n} CONFIG_SECTION="$CONFIG"
		# 将指定的节名称存储到 CONFIG_SECTION。
	fi
}

uci_rename() {
	# 作用：重命名指定包的配置节或选项。
	local PACKAGE="$1"
	# 将第一个参数存储为包名称。
	local CONFIG="$2"
	# 将第二个参数存储为配置节。
	local OPTION="$3"
	# 将第三个参数存储为配置选项。
	local VALUE="$4"
	# 将第四个参数存储为新名称。

	/sbin/uci ${UCI_CONFIG_DIR:+-c $UCI_CONFIG_DIR} rename "$PACKAGE.$CONFIG${VALUE:+.$OPTION}=${VALUE:-$OPTION}"
	# 执行 UCI 命令，将指定节或选项重命名为新名称。
}

uci_remove() {
	# 作用：删除指定包的配置节或选项。
	local PACKAGE="$1"
	# 将第一个参数存储为包名称。
	local CONFIG="$2"
	# 将第二个参数存储为配置节。
	local OPTION="$3"
	# 将第三个参数存储为配置选项。

	/sbin/uci ${UCI_CONFIG_DIR:+-c $UCI_CONFIG_DIR} del "$PACKAGE.$CONFIG${OPTION:+.$OPTION}"
	# 执行 UCI 命令，删除指定的节或选项。
}

uci_remove_list() {
	# 作用：从指定包、节的列表选项中删除一个值。
	local PACKAGE="$1"
	# 将第一个参数存储为包名称。
	local CONFIG="$2"
	# 将第二个参数存储为配置节。
	local OPTION="$3"
	# 将第三个参数存储为配置选项。
	local VALUE="$4"
	# 将第四个参数存储为要删除的值。

	/sbin/uci ${UCI_CONFIG_DIR:+-c $UCI_CONFIG_DIR} del_list "$PACKAGE.$CONFIG.$OPTION=$VALUE"
	# 执行 UCI 命令，从指定列表中删除给定的值。
}

uci_commit() {
	# 作用：提交指定包的配置更改，使其持久化。
	local PACKAGE="$1"
	# 将第一个参数存储为包名称。
	/sbin/uci ${UCI_CONFIG_DIR:+-c $UCI_CONFIG_DIR} commit $PACKAGE
	# 执行 UCI 命令，提交指定包的配置更改。
}
