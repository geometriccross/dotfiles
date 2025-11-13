#!/bin/bash

while getopts p:h: flag; do
	case "${flag}" in
	p) pdf_path=${OPTARG} ;;
	h) pdf_hash=${OPTARG} ;;
	*)
		echo 'unlock-pdf.sh -p [path to locked pdf] -h [pdf password]'
		;;
	esac
done

docker images --format '{{.Repository}}' |
	grep unlock-pdf >/dev/null ||
	docker image build . -f ./modules/unlock-pdf/Dockerfile -t unlock-pdf:latest -q >/dev/null

docker run --rm \
	-v "$(dirname "$pdf_path")":/work \
	unlock-pdf:latest \
	qpdf --password="$pdf_hash" "/work/$(basename "$pdf_path")" "/work/unlocked_$(basename "$pdf_path")"
