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

main() {
	base_dir=$(
		cd "$(dirname "${BASH_SOURCE:-$0}")" || "${HOME}"
		pwd
	)

	# install envrioment dependent packages
	case $(process_env_is) in
	container)
		# install oh-my-zsh in docker, quietly
		apt-get install -y wget &&
			wget -O- https://github.com/deluan/zsh-in-docker/releases/download/v1.2.1/zsh-in-docker.sh
		;;

	# case wsl or onpremises
	*)
		# install powerlevel10k
		if ! test -d "${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k"; then
			git clone --depth=1 https://github.com/romkatv/powerlevel10k.git "${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k"
		fi

		# install oh-my-zsh
		if ! test -d "${HOME}/.oh-my-zsh"; then
			sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
		fi

		# install neovim
		if ! nvim -v; then
			curl -LO https://github.com/neovim/neovim/releases/latest/download/nvim.appimage
			sudo chmod u+x nvim.appimage
			sudo ./nvim.appimage

			sudo apt-get install -y make gcc ripgrep unzip git xclip
		fi

		# install neovim setting
		if ! test -d "${HOME}/.config/nvim"; then
			git clone https://github.com/geometriccross/nvim_settings.git "${HOME}/.config/nvim"
		fi
		;;
	esac

	if $?; then
		filtering_path | xargs -I FILE ln -s "${base_dir}/FILE" "${1:-${HOME}}/FILE"
	fi
}

# If DEBUG is true, the main function is not called, only loaded
DEBUG=false
while getopts ":d" opt; do
	case ${opt} in
	d)
		DEBUG=true
		;;
	\?)
		echo "Invalid option: $OPTARG" 1>&2
		;;
	esac
done

if [ "${DEBUG}" = false ]; then
	main "$@"
fi
