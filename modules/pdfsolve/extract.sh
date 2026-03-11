#!/usr/bin/env bash

mkdir -p $XDG_DATA_HOME/pdfsolve
pdf2john=$XDG_DATA_HOME/pdfsolve/pdf2john.py
[ ! -f $pdf2john ] && curl -sL https://raw.githubusercontent.com/magnumripper/JohnTheRipper/bleeding-jumbo/run/pdf2john.py -o $pdf2john

while read -r file; do
	realpath $file | xargs -I {} echo -n {}:
	python $pdf2john $file
done

