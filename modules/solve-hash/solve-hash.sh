#!/bin/bash

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
# We used, -a 0 -> Hybrid Wordlist + Mask

# Device Type
# 1 | CPU
# 2 | GPU
# 3 | FPGA, DSP, Co-Processor
# We used, -D 2 -O -> GPU optimized

hashcat --stdout --force "$(dirname $0)"/wordlist.txt -r /usr/share/hashcat/rules/best64.rule >/tmp/newpass.txt 2>>/tmp/hashcat.err

docker images --format '{{.Repository}}' |
	grep solve-hash >/dev/null ||
	docker image build . -f ./modules/solve-hash/Dockerfile -t solve-hash:latest -q >/dev/null

while read -r key_hash; do
	echo "$key_hash" | cut -d ':' -f 2 >/tmp/hash.txt

	docker run --gpus all \
		-v /tmp/newpass.txt:/newpass.txt:ro \
		-v /tmp/hash.txt:/hash.txt:ro \
		solve-hash:latest \
		hashcat -m 10500 -a 0 -D 2 -O /hash.txt /newpass.txt | grep 'pdf' | head -1
done
