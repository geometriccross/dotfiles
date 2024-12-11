#!/bin/bash

filtering_path() {
	for file in ./.*
	do
		case "${file}" in
			./.git*) ;;
			./.shellspec) ;;
			*) echo "${file}" 
		esac
	done
}

process_env_is() {
	if grep -i "docker" "/proc/1/cgroup" > /dev/null; then
		echo container
	elif grep -i "WSL" "/proc/version" > /dev/null; then
		echo wsl
	else
		echo on-premises
	fi
}

main() {
	base_dir=$(cd "$(dirname "${BASH_SOURCE:-$0}")" || "${HOME}"; pwd)
	ln -s "${base_dir}/FILE" "${1:-${HOME}}/FILE"
}

