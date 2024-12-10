#!/bin/bash

base_dir=$(cd "$(dirname "${BASH_SOURCE:-$0}")" || "${HOME}"; pwd)

for file in ./.*
do
	case "${file}" in
		./.git*) ;;
		./.shellspec) ;;
		*) echo ln -s "${base_dir}/FILE" "${1:-${HOME}}/FILE" ;;
	esac
done

