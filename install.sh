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

main() {
	base_dir=$(cd "$(dirname "${BASH_SOURCE:-$0}")" || "${HOME}"; pwd)
	ln -s "${base_dir}/FILE" "${1:-${HOME}}/FILE"
}

