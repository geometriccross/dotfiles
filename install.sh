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

	check_cmd_with_prompt "${app_name}" "${check_cmd}" \
		&& install_with_prompt "${app_name}" "${@}"
	printf "\e[0m"
}

# ---------- Setup Editor ----------
install_nvim() {
	if ! nvim -v >/dev/null; then
		echo Neovim is not installed.
		echo start install...

		curl -LO https://github.com/neovim/neovim/releases/latest/download/nvim.appimage &&
			sudo chmod u+x nvim.appimage &&
			sudo ./nvim.appimage &&
			echo Install Neovim success!

		echo Install required packages...
		sudo apt install -y make gcc ripgrep unzip git xclip &&
			echo Install required packages success!
	else
		echo Neovim is already installed.
	fi
}

install_kickstart() {
	local path="${HOME}/.config/nvim"
	if [[ ! -e $path ]]; then
		echo kickstart.vim is not installed.
		echo Start install kickstart.nvim

		git clone git@github.com:geometriccross/kickstart.nvim.git "${path}" &&
			echo Install kickstart.vim success!
	else
		echo kickstart.vim is already installed.
	fi
}
main() {
	base_dir=$(
		cd "$(dirname "${BASH_SOURCE:-$0}")" || "${HOME}"
		pwd
	)
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

