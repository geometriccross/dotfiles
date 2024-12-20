#!/bin/bash

filtering_path() {
	for file in ./.*; do
		case "${file}" in
		./.git*) ;;
		./.shellspec) ;;
		*) echo "${file}" ;;
		esac
	done
}

process_env_is() {
	if grep -i "docker" "/proc/1/cgroup" >/dev/null; then
		echo container
	elif grep -i "WSL" "/proc/version" >/dev/null; then
		echo wsl
	else
		echo on-premises
	fi
}

sand_with_bar() {
	# between \e[ and color number is necessary to keep space
	echo =================== "${*}" ===================
}

check_cmd_with_prompt() {
	app_name="${1}" && shift

	if eval "${*}" >/dev/null 2>/dev/null; then
		echo "${app_name}" is already installed.
	else
		echo "${app_name}" is not installed. >&2
	fi
}

install_with_prompt() {
	app_name="${1}" && shift
	echo Start install "${app_name}".

	if eval "${*}"; then
		sand_with_bar Install "${app_name}" success!
	else
		sand_with_bar Installing "${app_name}" is failed. >&2
	fi
}

install_wizard() {
	app_name="${1}" && shift
	check_cmd="${1}" && shift

	# change a color into blue
	printf "\e[34m"
	sand_with_bar "${app_name}"

	check_cmd_with_prompt "${app_name}" "${check_cmd}" &&
		install_with_prompt "${app_name}" "${@}"
	printf "\e[0m"
}

main() {
	base_dir=$(
		cd "$(dirname "${BASH_SOURCE:-$0}")" || "${HOME}"
		pwd
	)

	# install neovim and required packages
	install_wizard "Neovim" "nvim -v" "$(
		cat <<-EOF
			curl -LO https://github.com/neovim/neovim/releases/latest/download/nvim.appimage
				&& sudo chmod u+x nvim.appimage
				&& sudo ./nvim.appimage

			sudo apt install -y make gcc ripgrep unzip git xclip
		EOF
	)"

	install_wizard "Neovim settings" "test -d $HOME/config/nvim" "$(
		cat <<-EOF
			git clone https://github.com/geometriccross/nvim_settings.git $HOME/.config/nvim
		EOF
	)"

	case $(process_env_is) in
	container)
		# Default powerline10k theme, no plugins installed
		sh -c "$(wget -O- https://github.com/deluan/zsh-in-docker/releases/download/v1.2.1/zsh-in-docker.sh)"
		;;

	wsl) ;;
	on-premises) ;;
	esac

	ln -s "${base_dir}/FILE" "${1:-${HOME}}/FILE"
}
