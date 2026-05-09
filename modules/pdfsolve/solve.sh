#!/usr/bin/env bash

set -e

# hashtype
# 10500 | PDF 1.4 - 1.6 (Acrobat 5 - 8) | Document

# # | Attack Mode
# ===+======
# 0 | Straight
# 1 | Combination
# 3 | Brute-force
# 6 | Hybrid Wordlist + Mask
# 7 | Hybrid Mask + Wordlist
# 9 | Association

# Device Type
# 1 | CPU
# 2 | GPU
# 3 | FPGA, DSP, Co-Processor
# We used, -D 2 -O -> GPU optimized

function help () {
	echo "Usage: $0 -w [path to wordlist]"
}

while [[ $# -gt 0 ]]; do
	case $1 in
		-w|--wordlist)
			wordlist_path="$2"
			shift 2
			;;
		-m|--mode)
			mode="$2"
			shift 2
			;;
		-*)
			help
			exit 1
			;;
		*)
			[[ -z "$1" ]] || { echo "hash_file is not set"; help; exit 1; }
			hash_file="$1"
			shift
			;;
	esac
done

if [[ -n "$hash_file" ]]; then
	cat -- "$hash_file"
elif [[ ! -t 0 ]]; then
	cat
else
	help
	exit 1
fi



combinator3.bin ./wordlists/basic.txt ./wordlists/padding.txt ./wordlists/basic.txt |
	grep -v "^[_-]" | 
	grep -v "[_-]$"

combinator.bin ./$wordlist_path ./$wordlist_path |
	cleanup-rules.bin $mode > $XDG_DATA_HOME/pdfsolve/combination.txt

# ex, password + 0000
# hashcat -m 10500 -a 6 $XDG_DATA_HOME/pdfsolve/combination.txt ?d?d?d?d

# hashcat --stdout --force $wordlist_path -r /usr/share/hashcat/rules/best64.rule >/tmp/newpass.txt 2>>/tmp/hashcat.err
