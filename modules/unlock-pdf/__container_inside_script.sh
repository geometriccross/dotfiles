#!/bin/bash

# IN: pdf file path
# OUT: pdf file path

get_hash() {
    xargs perl pdf2john.pl | sed "s/^.*pdf://"
}

echo "$1" | get_hash > hash.txt
hashcat -a 3 -D 2 -w 3 -m 10700 hash.txt #"${1#.pdf}_unlocked.pdf"
